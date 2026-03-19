/**
 * Invitation Service - Organization Member Invitations
 *
 * WHY: Handles inviting members to organizations with custom roles and permissions
 * HOW: Uses Better Auth's invitation system with our custom role architecture
 *
 * ARCHITECTURE:
 * - Studio owners have "studio-owner" role = full access (no permissions stored)
 * - Other members have custom roles stored as JSON with granular permissions
 * - We extend Better Auth's invitation to support our permission system
 *
 * FLOW:
 * 1. Check if user already exists as member
 * 2. Create/validate the custom role (if not studio-owner)
 * 3. Create Better Auth invitation with the role
 * 4. Send invitation email (mocked for now)
 * 5. User accepts → Better Auth creates/adds user as member with role
 */

import 'server-only'

import { auth } from '@/lib/better-auth/auth'
import { headers } from 'next/headers'
import { sendOrganizationInvitationEmail } from './email.service'
import { prisma } from '@/lib/config'
import { getOrganizationUrl } from './domain-lookup.service'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

export interface InviteMemberParams {
  organizationId: string
  organizationName: string
  inviterName: string
  email: string
  role: string // Can be "studio-owner" or JSON string with permissions or "ROLENAME|||[permissions]"
  userId?: string // Optional: user ID performing the action (for activity logging)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Merge custom permissions with Better Auth's required internal defaults
 *
 * INTERNAL PERMISSIONS (always included):
 * - organization:update, organization:delete - Required for org management
 * - ac:* - Required for role/permission management UI
 *
 * USER-CONTROLLED PERMISSIONS (NOT forced):
 * - member:*, invitation:*, team:*, clients:*, etc. - User has full control
 */
function mergeWithBetterAuthDefaults(
  customPermissions: string[]
): Record<string, string[]> {
  // Convert custom permissions array to Better Auth format
  const customPermissionObj: Record<string, string[]> = {}
  for (const perm of customPermissions) {
    const [resource, action] = perm.split(':')
    if (!customPermissionObj[resource]) {
      customPermissionObj[resource] = []
    }
    customPermissionObj[resource].push(action)
  }

  // ONLY include Better Auth's truly INTERNAL permissions
  const requiredInternalPermissions: Record<string, string[]> = {
    // Required for organization management in Better Auth
    organization: ['update', 'delete'],
    // Required for viewing/managing roles in Better Auth's AC system
    ac: ['read', 'create', 'update', 'delete'],
  }

  // Start with required internal permissions
  const merged: Record<string, string[]> = { ...requiredInternalPermissions }

  // Add ALL custom permissions (user has full control)
  for (const [resource, actions] of Object.entries(customPermissionObj)) {
    merged[resource] = actions
  }

  return merged
}

/**
 * Process role string and create/validate the role in database
 *
 * ROLE FORMATS:
 * - "studio-owner" → Fixed role, no processing needed
 * - "ROLENAME|||["perm1","perm2"]" → Named reusable role
 * - '["perm1","perm2"]' → Auto-generated custom role
 *
 * RETURNS: The role name to use in the invitation
 */
async function processRole(
  organizationId: string,
  role: string
): Promise<string> {
  // Studio owner - no processing needed
  if (role === 'owner' || role === 'owner') {
    return 'owner'
  }

  let roleName = role

  // CASE 1: Named global role: "role-name|||["permissions"]"
  if (role.includes('|||') && role.includes('[')) {
    const [userRoleName, permissionsJson] = role.split('|||', 2)

    const permissions = JSON.parse(permissionsJson) as string[]

    // Scope role name to organization to prevent conflicts
    // Format: orgId_roleName (e.g., "afcxfm_project-manager")
    const orgPrefix = organizationId.slice(0, 6).toLowerCase()
    const customRoleName = `${orgPrefix}_${userRoleName}`.toLowerCase()

    // Merge custom permissions with Better Auth defaults
    const mergedPermissions = mergeWithBetterAuthDefaults(permissions)

    // Check if role already exists using Prisma
    const existingRole = await prisma.organizationRole.findFirst({
      where: {
        organizationId,
        role: customRoleName,
      },
    })

    if (existingRole) {
      return customRoleName
    }

    // Role doesn't exist, create it using Prisma
    const roleId = `${organizationId}_${customRoleName}_${Date.now()}`
    await prisma.organizationRole.create({
      data: {
        id: roleId,
        organizationId,
        role: customRoleName,
        permission: JSON.stringify(mergedPermissions),
      },
    })
    return customRoleName
  }

  // CASE 2: JSON permissions array (auto-generated custom role)
  if (role.startsWith('[')) {
    const permissions = JSON.parse(role) as string[]

    // Generate unique role name based on permissions
    // Sort to ensure consistent hash regardless of order
    const sortedPermissions = [...permissions].sort()
    const roleHash = Buffer.from(sortedPermissions.join(','))
      .toString('base64')
      .slice(0, 8)
    roleName = `custom-${roleHash}`.toLowerCase()

    // Merge custom permissions with Better Auth defaults
    const mergedPermissions = mergeWithBetterAuthDefaults(permissions)

    // Check if role exists and if permissions match using Prisma
    const existingRole = await prisma.organizationRole.findFirst({
      where: {
        organizationId,
        role: roleName,
      },
    })

    if (existingRole) {
      // Verify permissions match
      const existingPermObj =
        typeof existingRole.permission === 'string'
          ? JSON.parse(existingRole.permission)
          : existingRole.permission

      const permissionsMatch =
        JSON.stringify(existingPermObj) === JSON.stringify(mergedPermissions)

      if (!permissionsMatch) {
        // Permissions don't match - create unique role
        const timestamp = Date.now().toString(36)
        roleName = `custom-${roleHash}-${timestamp}`.toLowerCase()

        const roleId = `${organizationId}_${roleName}_${Date.now()}`
        await prisma.organizationRole.create({
          data: {
            id: roleId,
            organizationId,
            role: roleName,
            permission: JSON.stringify(mergedPermissions),
          },
        })
      }
    } else {
      // Role doesn't exist - create it
      const roleId = `${organizationId}_${roleName}_${Date.now()}`
      await prisma.organizationRole.create({
        data: {
          id: roleId,
          organizationId,
          role: roleName,
          permission: JSON.stringify(mergedPermissions),
        },
      })
    }
  }

  return roleName
}

// ============================================================================
// INVITATION SERVICE
// ============================================================================

/**
 * Invite member to organization
 *
 * WORKFLOW:
 * 1. Validate: Can't invite self, can't invite existing member
 * 2. Process role: Create/validate custom role in database
 * 3. Create Better Auth invitation
 * 4. Send invitation email (mocked)
 * 5. Return invitation details
 *
 * USER EXISTENCE:
 * - User doesn't exist: Better Auth creates account when they accept invitation
 * - User exists: Better Auth adds them as member when they accept invitation
 */
export async function inviteMemberToOrganization(
  params: InviteMemberParams
): Promise<{
  id: string
  email: string
  role: string
  status: string
  expiresAt: Date
  invitationLink: string
}> {
  const { organizationId, organizationName, inviterName, email, role, userId } =
    params

  // SECURITY: Prevent inviting users as studio-owner
  if (role === 'owner' || role === 'owner') {
    throw new Error(
      'Cannot invite users as studio owner. Studio owners must be set during organization creation.'
    )
  }

  // SECURITY: Check if user already exists as member
  const existingMembers = await auth.api.listMembers({
    headers: await headers(),
    query: {
      organizationId,
    },
  })

  const memberExists = existingMembers?.members?.some(
    (member) => member.user.email === email
  )

  if (memberExists) {
    throw new Error('This user is already a member of the organization')
  }

  // Process role: Create/validate in database
  const processedRoleName = await processRole(organizationId, role)

  // Create Better Auth invitation
  const invitation = await auth.api.createInvitation({
    headers: await headers(),
    body: {
      email,
      role: processedRoleName as 'owner', // Type cast for custom roles
      organizationId,
    },
  })

  // Generate invitation link using organization's actual domain (subdomain or custom domain)
  // CRITICAL: This ensures invitations work correctly with multi-tenant architecture
  const baseUrl = await getOrganizationUrl(organizationId)
  const invitationLink = `${baseUrl}/accept-invitation?id=${invitation.id}`

  // Send invitation email
  try {
    const emailResult = await sendOrganizationInvitationEmail({
      to: email,
      subject: `Join ${organizationName} on ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}`,
      inviterName,
      organizationName,
      invitationLink,
      role: processedRoleName,
      organizationId, // Pass org ID to use verified domain
    })

    if (!emailResult.success) {
      console.error('[Invitation] Email failed:', emailResult.error)
    }
  } catch (error) {
    // Don't throw - invitation was created, email failure logged above
    console.error('[Invitation] Email error:', error)
  }

  // Log the activity if userId is provided (audit trail for invitations)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'invitation',
      entityId: invitation.id!,
    })
  }

  return {
    id: invitation.id!,
    email: invitation.email!,
    role: invitation.role || processedRoleName,
    status: 'pending',
    expiresAt: invitation.expiresAt,
    invitationLink,
  }
}

/**
 * Cancel invitation
 *
 * WHY: Allows organization owners/admins to revoke pending invitations
 * HOW: Calls Better Auth API to cancel the invitation
 *
 * @param organizationId - The organization ID (for activity logging)
 * @param invitationId - The invitation ID to cancel
 * @param userId - Optional user ID performing the action (for activity logging)
 */
export async function cancelInvitation(
  organizationId: string,
  invitationId: string,
  userId?: string
): Promise<void> {
  await auth.api.cancelInvitation({
    headers: await headers(),
    body: {
      invitationId,
    },
  })

  // Log the activity if userId is provided (audit trail for cancellations)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'invitation',
      entityId: invitationId,
    })
  }
}

/**
 * Get pending invitations for organization
 */
export async function getPendingInvitations(organizationId: string) {
  // Get all invitations from Better Auth
  const invitations = await prisma.invitation.findMany({
    where: {
      organizationId,
      status: 'pending',
      expiresAt: {
        gt: new Date(), // Not expired
      },
    },
    orderBy: {
      id: 'desc',
    },
  })

  return invitations
}

/**
 * Check if user has pending invitation
 *
 * Used after authentication to check if user should skip onboarding
 * and be directly added to an organization
 */
export async function getUserPendingInvitation(email: string) {
  const invitation = await prisma.invitation.findFirst({
    where: {
      email,
      status: 'pending',
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: {
      id: 'desc', // Get most recent invitation
    },
  })

  return invitation
}

/**
 * Resend invitation email
 *
 * WORKFLOW:
 * 1. Find the existing pending invitation
 * 2. Cancel the old invitation (cleans up Better Auth state)
 * 3. Create a new invitation with same details
 * 4. Send fresh email with new link
 *
 * WHY RECREATE: Better Auth doesn't support resending - we cancel and recreate
 * to get a new invitation ID and fresh expiration date
 *
 * @param params.organizationId - The organization ID
 * @param params.organizationName - The organization name (for email)
 * @param params.inviterName - The inviter's name (for email)
 * @param params.invitationId - The old invitation ID to resend
 * @param params.userId - Optional user ID performing the action (for activity logging)
 */
/**
 * Get invitation details by ID (public lookup).
 *
 * WHY: Auth forms need to know the invitation email and org info.
 * HOW: Returns minimal public-safe invitation data.
 *
 * SOURCE OF TRUTH: InvitationDetails, InvitationPublicLookup
 *
 * @param invitationId - The invitation ID to look up
 */
export async function getInvitationDetails(invitationId: string) {
  return await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })
}

export async function resendInvitation(params: {
  organizationId: string
  organizationName: string
  inviterName: string
  invitationId: string
  userId?: string
}): Promise<{
  id: string
  email: string
  role: string
  status: string
  expiresAt: Date
  invitationLink: string
}> {
  const { organizationId, organizationName, inviterName, invitationId, userId } =
    params

  // Find the existing invitation to get email and role
  const existingInvitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: {
      email: true,
      role: true,
      organizationId: true,
      status: true,
    },
  })

  if (!existingInvitation) {
    throw new Error('Invitation not found')
  }

  if (existingInvitation.organizationId !== organizationId) {
    throw new Error('Invitation does not belong to this organization')
  }

  if (existingInvitation.status !== 'pending') {
    throw new Error('Only pending invitations can be resent')
  }

  const email = existingInvitation.email
  const role = existingInvitation.role || 'member'

  // Cancel the old invitation
  await auth.api.cancelInvitation({
    headers: await headers(),
    body: {
      invitationId,
    },
  })

  // Create a new invitation with Better Auth
  const newInvitation = await auth.api.createInvitation({
    headers: await headers(),
    body: {
      email,
      role: role as 'owner',
      organizationId,
    },
  })

  // Generate invitation link using organization's actual domain
  const baseUrl = await getOrganizationUrl(organizationId)
  const invitationLink = `${baseUrl}/accept-invitation?id=${newInvitation.id}`

  // Send fresh invitation email
  try {
    const emailResult = await sendOrganizationInvitationEmail({
      to: email,
      subject: `Reminder: Join ${organizationName} on ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}`,
      inviterName,
      organizationName,
      invitationLink,
      role,
      organizationId, // Pass org ID to use verified domain
    })

    if (!emailResult.success) {
      console.error('[Invitation Resend] Email failed:', emailResult.error)
    }
  } catch (error) {
    // Don't throw - invitation was created, email failure logged above
    console.error('[Invitation Resend] Email error:', error)
  }

  // Log the activity if userId is provided
  // NOTE: This is logged as 'create' since we created a new invitation
  // The old invitation cancellation is part of the same operation
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'invitation',
      entityId: newInvitation.id!,
    })
  }

  return {
    id: newInvitation.id!,
    email: newInvitation.email!,
    role: newInvitation.role || role,
    status: 'pending',
    expiresAt: newInvitation.expiresAt,
    invitationLink,
  }
}
