'use client'

import { useCallback, useState } from 'react'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { PermissionSwitches } from './permission-switches'
import { ShieldCheck, Info } from 'lucide-react'
import { RoleCommandSelector } from './role-command-selector'
import type { OrganizationRole } from './role-command-selector'
import { getPermissionGroups } from '@/lib/better-auth/permission-helpers'
import { DEFAULT_ADMIN_PERMISSIONS } from '@/lib/better-auth/permissions'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ManageRoleSheetContentProps {
  editingRole?: OrganizationRole | null
  onClose?: () => void
  organizationId: string
}

export function ManageRoleSheetContent({
  editingRole,
  onClose,
  organizationId,
}: ManageRoleSheetContentProps) {
  const [selectedRole, setSelectedRole] = useState<OrganizationRole | null>(
    editingRole || null
  )
  const [permissions, setPermissions] = useState<string[]>(
    editingRole ? [] : [...DEFAULT_ADMIN_PERMISSIONS]
  )

  const handlePermissionsChange = useCallback((newPermissions: string[]) => {
    setPermissions(newPermissions)
  }, [])

  const handleRoleSelect = useCallback(
    (role: OrganizationRole | null) => {
      setSelectedRole(role)

      if (!role) {
        // Custom permissions selected
        setPermissions([...DEFAULT_ADMIN_PERMISSIONS])
        return
      }

      // Load role's permissions
      if (role.role === 'admin' || role.id === 'admin') {
        setPermissions([...DEFAULT_ADMIN_PERMISSIONS])
        return
      }

      // Convert permission object to array
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
    []
  )

  const handleCreateNewRole = useCallback((roleName: string) => {
    // Not used in standalone mode
  }, [])

  const handleRoleSaved = () => {
    // Role was saved, close the sheet
    onClose?.()
  }

  const permissionGroups = getPermissionGroups()

  return (
    <SheetContent className="w-full sm:max-w-md overflow-y-auto p-6">
      <SheetHeader className="p-0">
        <SheetTitle className="text-xl flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Manage Roles
        </SheetTitle>
        <SheetDescription className="text-sm">
          Browse existing roles, create new roles, or edit role permissions. All
          changes are saved immediately to the database.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 mt-6">
        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            In standalone mode, roles are created immediately when you search and
            create them. No need to save a member first!
          </AlertDescription>
        </Alert>

        {/* Role Selector with all the awesome features */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select or Create Role</Label>
          <RoleCommandSelector
            selectedRole={selectedRole}
            onRoleSelect={handleRoleSelect}
            onCreateNewRole={handleCreateNewRole}
            currentPermissions={permissions}
            organizationId={organizationId}
            standalone={true}
            onRoleSaved={handleRoleSaved}
          />
          <p className="text-xs text-muted-foreground">
            Search for existing roles, select Admin, or type a new role name to
            create it.
          </p>
        </div>

        {/* Permissions Section */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Permissions Preview</Label>
            <p className="text-xs text-muted-foreground">
              {selectedRole
                ? `Viewing permissions for "${selectedRole.role}" role. Create a new role to customize.`
                : 'Admin permissions are pre-selected. Select a role above or create a new one.'}
            </p>
          </div>

          <div className="rounded-lg">
            <PermissionSwitches
              onPermissionsChange={handlePermissionsChange}
              initialPermissions={permissions}
              isOwner={false}
              disabled={true}
              permissionGroups={permissionGroups}
            />
          </div>
        </div>
      </div>
    </SheetContent>
  )
}
