/**
 * Helper functions to transform Better Auth permissions into UI-friendly formats
 * This bridges the gap between the permission definitions and the UI components
 *
 * CRITICAL: This file ONLY re-exports and transforms data from permissions.ts
 * It does NOT duplicate any permission metadata. Everything comes from the SOURCE OF TRUTH.
 *
 * B2B MODEL: Platform → Organizations
 * All permissions are at the organization level.
 */

import {
  organizationStatement,
  RESOURCE_METADATA,
  type Permission,
} from './permissions'

export interface PermissionGroup {
  resource: string
  label: string
  description: string
  actions: string[]
}

/**
 * Generates permission groups from the organizationStatement
 * This is used for the organization member management UI
 *
 * DYNAMIC: When you add a new resource to organizationStatement and RESOURCE_METADATA
 * in permissions.ts, it will AUTOMATICALLY appear in the member management sheets!
 */
export function getPermissionGroups(): PermissionGroup[] {
  const groups: PermissionGroup[] = []

  // Filter out Better Auth internal permissions
  // These are managed automatically and shouldn't be shown in the UI
  const internalResources = ['ac', 'organization', 'team']
  const filteredResources = Object.entries(organizationStatement).filter(
    ([resource]) => !internalResources.includes(resource)
  )

  for (const [resource, actions] of filteredResources) {
    const metadata = RESOURCE_METADATA[resource as keyof typeof RESOURCE_METADATA]
    if (!metadata) {
      // Skip resources without metadata (shouldn't happen in practice)
      console.warn(`Missing metadata for resource: ${resource}`)
      continue
    }

    groups.push({
      resource,
      label: metadata.label,
      description: metadata.description,
      actions: [...actions] as string[],
    })
  }

  return groups
}

// Re-export for backwards compatibility
export { getPermissionGroups as getOrganizationPermissionGroups }

// Type re-export
export type { Permission }
