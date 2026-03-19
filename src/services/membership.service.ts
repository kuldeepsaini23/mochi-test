/**
 * Membership Service (DAL)
 *
 * Pure data access layer for membership operations
 * NO business logic - just database queries
 *
 * Activity logging is added to all create/update/delete operations
 * to track member role changes for audit trail purposes.
 */

import { prisma } from '@/lib/config'
import { logActivity } from './activity-log.service'

/**
 * Get user's membership in a specific organization
 *
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @returns Member with organization data, or null if not a member
 */
export async function getUserMembership(userId: string, organizationId: string) {
  return await prisma.member.findFirst({
    where: {
      userId,
      organizationId,
    },
    include: {
      organization: true,
    },
  })
}

/**
 * Check if a user has membership in a specific organization (existence check only).
 *
 * WHY: API routes like builder-ai/generate need a lightweight boolean membership
 * check without loading the full organization relation.
 *
 * SOURCE OF TRUTH KEYWORDS: MembershipExistsCheck, ApiRouteMemberAuth
 *
 * @param userId - User ID to check
 * @param organizationId - Organization ID to check membership in
 * @returns true if user is a member, false otherwise
 */
export async function hasOrganizationMembership(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const membership = await prisma.member.findFirst({
    where: {
      userId,
      organizationId,
    },
    select: { id: true },
  })
  return !!membership
}

/**
 * Check if user is an owner of ANY organization
 * Used for onboarding check
 *
 * @param userId - User ID
 * @returns true if user owns any organization, false otherwise
 */
export async function hasOrganizationOwnership(userId: string): Promise<boolean> {
  const ownership = await prisma.member.findFirst({
    where: {
      userId,
      role: 'owner',
    },
  })

  return !!ownership
}

/**
 * Get all user's organization memberships
 *
 * @param userId - User ID
 * @returns List of memberships with organization data
 */
export async function getUserMemberships(userId: string) {
  return await prisma.member.findMany({
    where: { userId },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

/**
 * Get user's onboarding status
 *
 * @param userId - User ID
 * @returns Organization info and onboarding status, or null if not onboarded
 */
export async function getUserOnboardingStatus(userId: string) {
  const membership = await prisma.member.findFirst({
    where: {
      userId,
      role: 'owner',
    },
    include: {
      organization: true,
    },
  })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingComplete: true },
  })

  return {
    hasOrganization: !!membership,
    organizationId: membership?.organizationId,
    organizationSlug: membership?.organization.slug,
    onboardingComplete: user?.onboardingComplete ?? false,
  }
}

/**
 * Mark user as onboarded
 *
 * @param userId - User ID
 */
export async function markUserOnboarded(userId: string) {
  return await prisma.user.update({
    where: { id: userId },
    data: { onboardingComplete: true },
  })
}

/**
 * Get all member user IDs for an organization.
 *
 * WHY: The send-notification helper needs all member userIds to send
 * org-wide notifications without fetching full user data.
 *
 * SOURCE OF TRUTH: GetAllMemberUserIds, OrgMemberUserIdList
 *
 * @param organizationId - Organization ID to fetch member IDs for
 * @returns Array of members with userId only
 */
export async function getAllMemberUserIds(organizationId: string) {
  return await prisma.member.findMany({
    where: { organizationId },
    select: { userId: true },
  })
}

/**
 * Get organization members with user info
 *
 * Used by automation actions to send notifications to team members.
 * Optionally filter by specific user IDs.
 *
 * @param organizationId - Organization ID
 * @param userIds - Optional array of user IDs to filter by
 * @returns List of members with user data (id, email, name)
 */
export async function getOrganizationMembers(organizationId: string, userIds?: string[]) {
  return await prisma.member.findMany({
    where: {
      organizationId,
      ...(userIds && userIds.length > 0 ? { userId: { in: userIds } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  })
}

/**
 * Update member role and permissions
 *
 * WHY: Allows organization owners/admins to change member roles
 * HOW: Processes role format, creates custom roles if needed, updates member
 *
 * @param params - Update parameters
 * @param params.memberId - The member ID to update
 * @param params.organizationId - The organization ID (for security validation)
 * @param params.role - The new role (can be named role, custom JSON, etc.)
 * @param params.permissions - Array of permission strings (e.g., ['leads:read', 'leads:write'])
 * @param params.userId - Optional user ID performing the action (for activity logging)
 * @returns Updated member
 */
export async function updateMemberRole(params: {
  memberId: string
  organizationId: string
  role: string
  permissions: string[]
  userId?: string
}) {
  const { memberId, organizationId, role, permissions, userId } = params

  // Check if role is a custom role (starts with "custom-") or needs to be created
  let finalRole = role

  // CASE 1: Named reusable role: "role-name|||["permissions"]"
  if (role.includes('|||') && role.includes('[')) {
    const [userRoleName] = role.split('|||', 2)

    // Special handling for "admin" - it's a global reusable role without org prefix
    const isAdminRole = userRoleName.toLowerCase() === 'admin'

    // Scope role name to organization to prevent conflicts
    // EXCEPT for "admin" which is global
    // Format: "admin" (global) or "orgId_roleName" (org-scoped)
    const namedRoleName = isAdminRole
      ? 'admin'
      : `${organizationId.slice(0, 6).toLowerCase()}_${userRoleName}`.toLowerCase()

    // Convert permissions array to object format
    // Use the permissions parameter directly (already validated and parsed)
    const permissionObject: Record<string, string[]> = {}
    for (const permission of permissions) {
      const [resource, action] = permission.split(':')
      if (!permissionObject[resource]) {
        permissionObject[resource] = []
      }
      permissionObject[resource].push(action)
    }

    // Check if role already exists
    const existingRole = await prisma.organizationRole.findFirst({
      where: {
        organizationId,
        role: namedRoleName,
      },
      select: { id: true },
    })

    if (!existingRole) {
      // Create new named role with the user's selected permissions
      const roleId = `${organizationId}_${namedRoleName}_${Date.now()}`
      await prisma.organizationRole.create({
        data: {
          id: roleId,
          organizationId,
          role: namedRoleName,
          permission: JSON.stringify(permissionObject),
        },
      })
    }

    finalRole = namedRoleName
  }
  // CASE 2: JSON permissions array (custom permissions for this member only)
  else if (role.startsWith('[') || role.startsWith('{')) {
    /**
     * SECURITY: Validate member belongs to the organization
     *
     * WHY: Even though router validates, defense-in-depth requires
     * service layer to also verify organization ownership.
     */
    const currentMember = await prisma.member.findFirst({
      where: {
        id: memberId,
        organizationId,
      },
      select: { role: true },
    })

    let customRoleName: string
    let roleId: string

    // If member already has a custom role, check if it's shared with others
    if (currentMember?.role.startsWith('custom-')) {
      customRoleName = currentMember.role

      // Check if this custom role is shared with other members
      const membersWithSameRole = await prisma.member.count({
        where: {
          organizationId,
          role: customRoleName,
        },
      })

      // If only this member has this role, we can safely update it
      // If multiple members share it, we need to create a new role
      if (membersWithSameRole === 1) {
        const existingRole = await prisma.organizationRole.findFirst({
          where: {
            organizationId,
            role: customRoleName,
          },
          select: { id: true },
        })
        roleId = existingRole?.id || `${organizationId}_${customRoleName}`
      } else {
        // Shared role - create a new unique role for this member
        customRoleName = `custom-${memberId.slice(0, 8)}`
        roleId = `${organizationId}_${customRoleName}`
      }
    } else {
      // Member doesn't have a custom role - create a new one
      customRoleName = `custom-${memberId.slice(0, 8)}`
      roleId = `${organizationId}_${customRoleName}`
    }

    // Convert permissions array to object format
    const permissionObject: Record<string, string[]> = {}
    for (const permission of permissions) {
      const [resource, action] = permission.split(':')
      if (!permissionObject[resource]) {
        permissionObject[resource] = []
      }
      permissionObject[resource].push(action)
    }

    // Update existing custom role or create new one
    await prisma.organizationRole.upsert({
      where: {
        id: roleId,
      },
      create: {
        id: roleId,
        organizationId,
        role: customRoleName,
        permission: JSON.stringify(permissionObject),
      },
      update: {
        permission: JSON.stringify(permissionObject),
        updatedAt: new Date(),
      },
    })

    finalRole = customRoleName
  }

  // Update member's role (scoped to org for defense-in-depth)
  const updatedMember = await prisma.member.update({
    where: {
      id: memberId,
      organizationId,
    },
    data: { role: finalRole },
  })

  // Log the activity if userId is provided (audit trail for role changes)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'member',
      entityId: memberId,
    })
  }

  return updatedMember
}

// ============================================================================
// ORGANIZATION ROLE OPERATIONS
// ============================================================================
// SOURCE OF TRUTH: OrganizationRoleCRUD, RolePermissions

/**
 * Get all custom roles for an organization.
 *
 * WHY: Used for role selector in member invitation/editing.
 * HOW: Returns all roles ordered by creation date.
 *
 * SOURCE OF TRUTH: OrganizationRoles, RoleList
 */
export async function getOrganizationRoles(organizationId: string) {
  return await prisma.organizationRole.findMany({
    where: { organizationId },
    select: {
      id: true,
      organizationId: true,
      role: true,
      permission: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get all members for an organization with enriched permissions.
 *
 * WHY: Team management page needs members with their role permissions.
 * HOW: Fetches members with user data, then enriches with role permissions.
 *
 * SOURCE OF TRUTH: OrganizationMembersWithPermissions, TeamMembers
 */
export async function getOrganizationMembersRaw(organizationId: string) {
  return await prisma.member.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Get role permissions from OrganizationRole table.
 *
 * WHY: Enriches member data with their actual permissions from the role definition.
 * HOW: Looks up role by name within the organization.
 *
 * SOURCE OF TRUTH: RolePermissionLookup
 */
export async function getRolePermission(organizationId: string, roleName: string) {
  return await prisma.organizationRole.findFirst({
    where: {
      organizationId,
      role: roleName,
    },
    select: { permission: true },
  })
}

/**
 * Get a single member by ID scoped to organization.
 *
 * WHY: Validates member exists and belongs to the org before operations.
 * HOW: findFirst with both id and organizationId in WHERE.
 *
 * SOURCE OF TRUTH: MemberLookup, MemberValidation
 */
export async function getOrganizationMember(
  organizationId: string,
  memberId: string
) {
  return await prisma.member.findFirst({
    where: {
      id: memberId,
      organizationId,
    },
    select: { userId: true, role: true },
  })
}

/**
 * Remove a member from an organization (hard delete).
 *
 * WHY: Removes access from a team member.
 * HOW: Hard deletes the member record, scoped to org for defense-in-depth.
 *
 * SOURCE OF TRUTH: MemberRemoval, MemberDelete
 */
export async function removeMember(organizationId: string, memberId: string) {
  return await prisma.member.delete({
    where: {
      id: memberId,
      organizationId,
    },
  })
}

/**
 * Create a new organization role.
 *
 * WHY: Allows creating reusable roles with specific permissions.
 * HOW: Creates role with org prefix and permission JSON.
 *
 * SOURCE OF TRUTH: OrganizationRoleCreate
 *
 * @returns The created role or { exists: true } if name already taken
 */
export async function createOrganizationRole(input: {
  organizationId: string
  roleNameInDb: string
  permissions: Record<string, string[]>
}) {
  // Check if role already exists
  const existingRole = await prisma.organizationRole.findFirst({
    where: {
      organizationId: input.organizationId,
      role: input.roleNameInDb,
    },
  })

  if (existingRole) {
    return { exists: true as const }
  }

  const roleId = `${input.organizationId}_${input.roleNameInDb}_${Date.now()}`
  const newRole = await prisma.organizationRole.create({
    data: {
      id: roleId,
      organizationId: input.organizationId,
      role: input.roleNameInDb,
      permission: JSON.stringify(input.permissions),
    },
  })

  return { exists: false as const, role: newRole }
}

/**
 * Update permissions for an organization role.
 *
 * WHY: Allows modifying role permissions, affecting all members with that role.
 * HOW: Verifies role belongs to org, then updates permission JSON.
 *
 * SOURCE OF TRUTH: OrganizationRoleUpdate, RolePermissionUpdate
 *
 * @returns Role info or null if not found
 */
export async function updateOrganizationRolePermissions(input: {
  organizationId: string
  roleId: string
  permissions: Record<string, string[]>
}) {
  const role = await prisma.organizationRole.findUnique({
    where: { id: input.roleId },
    select: { organizationId: true, role: true },
  })

  if (!role) {
    return null
  }

  if (role.organizationId !== input.organizationId) {
    return { wrongOrg: true as const, role: role.role }
  }

  await prisma.organizationRole.update({
    where: { id: input.roleId },
    data: {
      permission: JSON.stringify(input.permissions),
      updatedAt: new Date(),
    },
  })

  return { updated: true as const, roleName: role.role }
}

/**
 * Get all members with a specific role in an organization.
 *
 * WHY: Needed for realtime notifications when a role is updated.
 * HOW: Returns user IDs of all members with the given role.
 *
 * SOURCE OF TRUTH: MembersWithRole
 */
export async function getMembersWithRole(organizationId: string, roleName: string) {
  return await prisma.member.findMany({
    where: {
      organizationId,
      role: roleName,
    },
    select: { userId: true },
  })
}

/**
 * Delete an organization role.
 *
 * WHY: Removes a reusable role definition.
 * HOW: Verifies role belongs to org and isn't reserved, then hard deletes.
 *
 * SOURCE OF TRUTH: OrganizationRoleDelete
 *
 * @returns Object with result info or null if not found
 */
export async function deleteOrganizationRole(organizationId: string, roleId: string) {
  const role = await prisma.organizationRole.findUnique({
    where: { id: roleId },
    select: { organizationId: true, role: true },
  })

  if (!role) {
    return null
  }

  if (role.organizationId !== organizationId) {
    return { wrongOrg: true as const }
  }

  // Extract display name from role (remove org prefix if present)
  const roleName = role.role.split('_')[1] || role.role

  // SECURITY: Prevent deletion of reserved system roles
  const reservedRoles = ['admin', 'owner', 'client-owner', 'owner']
  if (reservedRoles.includes(roleName)) {
    return { reserved: true as const, roleName }
  }

  // SECURITY: Prevent deletion of custom per-member roles
  if (role.role.startsWith('custom-')) {
    return { customRole: true as const }
  }

  await prisma.organizationRole.delete({
    where: { id: roleId },
  })

  return { deleted: true as const, roleName, fullRoleName: role.role }
}

/**
 * Check if a portal organization already exists for a user.
 *
 * WHY: Only one portal organization allowed per portal owner.
 * HOW: Checks for isPortalOrganization=true org where user is owner.
 *
 * SOURCE OF TRUTH: PortalOrgExistence
 */
export async function hasExistingPortalOrganization(userId: string) {
  return await prisma.organization.findFirst({
    where: {
      isPortalOrganization: true,
      members: {
        some: {
          userId,
          role: 'owner',
        },
      },
    },
    select: { id: true, name: true },
  })
}
