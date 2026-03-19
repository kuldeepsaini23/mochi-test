'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { InfoIcon } from 'lucide-react'

interface PermissionGroup {
  resource: string
  label: string
  description: string
  actions: string[]
}

interface PermissionSwitchesProps {
  onPermissionsChange: (permissions: string[]) => void
  initialPermissions?: string[]
  isOwner?: boolean
  disabled?: boolean
  permissionGroups: PermissionGroup[]
}

export function PermissionSwitches({
  onPermissionsChange,
  initialPermissions = [],
  isOwner = false,
  disabled = false,
  permissionGroups,
}: PermissionSwitchesProps) {
  // Use initialPermissions directly as the source of truth (controlled component)
  const permissions = new Set(initialPermissions)

  const togglePermission = (permission: string) => {
    if (isOwner || disabled) return

    const newPermissions = new Set(permissions)
    if (newPermissions.has(permission)) {
      newPermissions.delete(permission)
    } else {
      newPermissions.add(permission)
    }
    onPermissionsChange(Array.from(newPermissions))
  }

  const toggleAllForResource = (resource: string, actions: string[]) => {
    if (isOwner || disabled) return

    const resourcePermissions = actions.map((action) => `${resource}:${action}`)
    const allEnabled = resourcePermissions.every((p) => permissions.has(p))

    const newPermissions = new Set(permissions)
    if (allEnabled) {
      resourcePermissions.forEach((p) => newPermissions.delete(p))
    } else {
      resourcePermissions.forEach((p) => newPermissions.add(p))
    }
    onPermissionsChange(Array.from(newPermissions))
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 mb-4">
          <InfoIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Organization Owners have full access to all permissions and cannot be
            modified.
          </p>
        </div>
      )}

      {permissionGroups.map((group, groupIndex) => {
        const resourcePermissions = group.actions.map(
          (action) => `${group.resource}:${action}`
        )
        const allEnabled =
          isOwner || resourcePermissions.every((p) => permissions.has(p))

        return (
          <div
            key={group.resource}
            className=" border rounded-lg"
          >
            {/* Group Header with Toggle All */}
            <div
              className={`flex items-center justify-between  p-4 ${
                isOwner ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              }`}
              onClick={() =>
                !isOwner &&
                !disabled &&
                toggleAllForResource(group.resource, group.actions)
              }
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">
                  {group.label}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {group.description}
                </p>
              </div>
              <Switch
                checked={allEnabled}
                disabled={isOwner || disabled}
                className="ml-3"
              />
            </div>

            <Separator className="" />

            {/* Individual Permissions */}
            <div className="space-y-0 p-4">
              {group.actions.map((action, actionIndex) => {
                const permission = `${group.resource}:${action}`
                const isEnabled = isOwner || permissions.has(permission)

                return (
                  <div
                    key={permission}
                    className={`flex items-center justify-between py-3 ${
                      isOwner
                        ? 'opacity-60 cursor-not-allowed'
                        : 'cursor-pointer'
                    } `}
                    onClick={() =>
                      !isOwner && !disabled && togglePermission(permission)
                    }
                  >
                    <Label
                      htmlFor={permission}
                      className="text-sm font-normal capitalize cursor-pointer flex-1"
                    >
                      {action}
                    </Label>
                    <Switch
                      id={permission}
                      checked={isEnabled}
                      disabled={isOwner || disabled}
                      className="ml-3"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
