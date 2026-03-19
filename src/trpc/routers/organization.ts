/**
 * Organization Router
 *
 * Thin controllers - just call services
 * All auth/permission checks happen in procedures BEFORE this runs
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  protectedProcedure,
  organizationProcedure,
  createStructuredError,
} from '../init'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '../procedures/feature-gates'
import {
  getUserOnboardingStatus,
  getUserMemberships,
  markUserOnboarded,
  updateMemberRole,
  getOrganizationRoles,
  getOrganizationMembersRaw,
  getRolePermission,
  getOrganizationMember,
  removeMember,
  createOrganizationRole,
  updateOrganizationRolePermissions,
  getMembersWithRole,
  deleteOrganizationRole,
  hasExistingPortalOrganization,
} from '@/services/membership.service'
import {
  createStudioOrganization,
  deleteOrganization,
} from '@/services/organization.service'
import {
  inviteMemberToOrganization,
  cancelInvitation,
  resendInvitation,
  getPendingInvitations,
  getUserPendingInvitation,
  getInvitationDetails,
} from '@/services/invitation.service'
import { ERROR_CODES } from '@/lib/errors'
import { realtime } from '@/lib/realtime'
import { isPortalOwnerEmail } from '@/lib/portal/config'

export const organizationRouter = createTRPCRouter({
  // ============================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // ============================================================================

  /**
   * Get invitation details by ID (PUBLIC)
   *
   * WHY: Allows auth forms to know what email the invitation was sent to
   * HOW: Returns minimal invitation data (email, org name) without auth
   *
   * SECURITY:
   * - Only returns public-safe data (email, org name, role)
   * - Does NOT reveal sensitive org data or permissions
   * - Validates invitation exists and is pending/not expired
   *
   * USAGE: Sign-up/sign-in forms call this to:
   * - Pre-fill and lock the email field
   * - Show org name the user is being invited to
   * - Validate invitation before auth flow
   */
  getInvitationDetails: baseProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ input }) => {
      const invitation = await getInvitationDetails(input.invitationId)

      // Validate invitation exists
      if (!invitation) {
        throw createStructuredError('NOT_FOUND', 'Invitation not found', {
          errorCode: ERROR_CODES.INVITATION_NOT_FOUND,
          message: 'This invitation does not exist or has been cancelled',
        })
      }

      // Validate invitation is still pending
      if (invitation.status !== 'pending') {
        throw createStructuredError(
          'BAD_REQUEST',
          'Invitation is no longer valid',
          {
            errorCode: ERROR_CODES.INVITATION_ALREADY_USED,
            status: invitation.status,
            message:
              invitation.status === 'accepted'
                ? 'This invitation has already been accepted'
                : 'This invitation has been cancelled',
          }
        )
      }

      // Validate invitation hasn't expired
      if (invitation.expiresAt < new Date()) {
        throw createStructuredError('BAD_REQUEST', 'Invitation has expired', {
          errorCode: ERROR_CODES.INVITATION_EXPIRED,
          message:
            'This invitation has expired. Please ask the organization admin to send a new invitation.',
        })
      }

      // Return public-safe invitation details
      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role || 'member',
        organizationId: invitation.organization.id,
        organizationName: invitation.organization.name,
        organizationSlug: invitation.organization.slug,
      }
    }),

  // ============================================================================
  // PROTECTED ENDPOINTS (Authentication required)
  // ============================================================================

  /**
   * Check onboarding status
   *
   * Used for polling after payment to detect when webhook completes
   */
  checkOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    // Just call service - no business logic here
    return await getUserOnboardingStatus(ctx.user.id)
  }),

  /**
   * Check onboarding access
   *
   * GUARD: Prevents users who already have ANY organization membership from accessing onboarding
   * Onboarding is ONLY for new users creating their first studio
   * Team members invited to organizations should NOT access onboarding
   */
  checkOnboardingAccess: protectedProcedure.query(async ({ ctx }) => {
    // Get all user's memberships
    const memberships = await getUserMemberships(ctx.user.id)

    // If user has ANY membership, they should not be on onboarding
    if (memberships.length > 0) {
      throw createStructuredError(
        'PRECONDITION_FAILED',
        'You have already completed onboarding',
        {
          errorCode: ERROR_CODES.STUDIO_ONBOARDING_COMPLETED,
          entityType: 'organization',
          message: 'You already belong to an organization',
        }
      )
    }

    // Check if user has pending invitation - they should accept it instead
    const pendingInvitation = await getUserPendingInvitation(ctx.user.email)

    if (pendingInvitation) {
      throw createStructuredError(
        'PRECONDITION_FAILED',
        'You have a pending invitation',
        {
          errorCode: ERROR_CODES.PENDING_INVITATION,
          invitationId: pendingInvitation.id,
          organizationId: pendingInvitation.organizationId,
          organizationName: pendingInvitation.organization.name,
          role: pendingInvitation.role || 'member',
          message: `You have been invited to join ${pendingInvitation.organization.name}`,
        }
      )
    }

    // User has no memberships and no invitations - can access onboarding
    return { canAccessOnboarding: true }
  }),

  /**
   * Create organization (FREE PLAN ONLY)
   *
   * Paid plans use Stripe webhook for organization creation.
   *
   * PORTAL ORGANIZATION CREATION:
   * If the creator's email matches PORTAL_INITIAL_OWNER_EMAIL, this creates
   * a portal organization with isPortalOrganization=true. Portal organizations
   * receive the hidden 'portal' tier with unlimited features.
   *
   * SECURITY:
   * - Portal owner detection uses case-insensitive exact email matching
   * - Each portal owner can only have ONE portal organization
   * - Audit logging is enabled for portal organization creation
   */
  createOrganization: protectedProcedure
    .input(
      z.object({
        studioName: z.string().min(1, 'Studio name is required'),
        phoneNumber: z.string().optional(),
        country: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        referralSource: z.string().optional(),
        role: z.string().optional(),
        teamSize: z.string().optional(),
        intendedUse: z.string().optional(),
        niche: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ========================================================================
      // PORTAL ORGANIZATION DETECTION
      // ========================================================================
      // Check if the creator is the portal owner (PORTAL_INITIAL_OWNER_EMAIL)
      // SECURITY: Case-insensitive exact match performed by isPortalOwnerEmail()
      const isCreatorPortalOwner = isPortalOwnerEmail(ctx.user.email)

      // If portal owner, verify they don't already have a portal organization
      // SECURITY: Only ONE portal organization allowed per portal owner
      if (isCreatorPortalOwner) {
        const existingPortalOrg = await hasExistingPortalOrganization(ctx.user.id)

        if (existingPortalOrg) {
          throw createStructuredError(
            'BAD_REQUEST',
            'Portal organization already exists',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: `You already have a portal organization: "${existingPortalOrg.name}" (ID: ${existingPortalOrg.id}). Only one portal organization is allowed per portal owner.`,
            }
          )
        }
      }

      // ========================================================================
      // CREATE ORGANIZATION
      // ========================================================================
      // Call service to create organization
      // Pass isPortalOrganization=true if creator is the portal owner
      const result = await createStudioOrganization({
        userId: ctx.user.id,
        studioName: input.studioName,
        phoneNumber: input.phoneNumber,
        country: input.country,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        isPortalOrganization: isCreatorPortalOwner,
        referralSource: input.referralSource,
        role: input.role,
        teamSize: input.teamSize,
        intendedUse: input.intendedUse,
        niche: input.niche,
      })

      // AUDIT: Log portal organization creation for security tracking
      if (isCreatorPortalOwner) {
        console.log(
          `[PORTAL AUDIT] Portal organization created: orgId=${result.organizationId}, userId=${ctx.user.id}, email=${ctx.user.email}, timestamp=${new Date().toISOString()}`
        )
      }

      // Mark user as onboarded (call service)
      await markUserOnboarded(ctx.user.id)

      return result
    }),

  /**
   * Get user's organizations with permissions
   *
   * Returns all organizations the user is a member of with their permissions.
   * Uses cached context method to avoid duplicate fetches during SSR.
   *
   * CACHE BEHAVIOR:
   * - Server: Cached per request via ctx.getUserOrganizations()
   * - Client: Set staleTime: Infinity (never refetch unless invalidated)
   */
  getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
    // Use cached context method (deduplicates with other server calls)
    const organizations = await ctx.getUserOrganizations()

    if (!organizations.length) {
      // Check if user has pending invitation
      const pendingInvitation = await getUserPendingInvitation(ctx.user.email)

      if (pendingInvitation) {
        // User has pending invitation - redirect to accept it
        throw createStructuredError(
          'PRECONDITION_FAILED',
          'You have a pending invitation',
          {
            errorCode: ERROR_CODES.PENDING_INVITATION,
            invitationId: pendingInvitation.id,
            organizationId: pendingInvitation.organizationId,
            organizationName: pendingInvitation.organization.name,
            role: pendingInvitation.role || 'member',
            message: `You have been invited to join ${pendingInvitation.organization.name}`,
          }
        )
      }

      // No memberships and no invitations - needs onboarding
      throw createStructuredError(
        'PRECONDITION_FAILED',
        'Please complete onboarding to access this feature',
        {
          errorCode: ERROR_CODES.ONBOARDING_INCOMPLETE,
          requiredStep: 'onboarding',
          message:
            "You don't have an organization. Please create an organization.",
        }
      )
    }

    return organizations
  }),

  /**
   * Get Active Organization
   *
   * WHY: Returns the currently active organization for the user
   * HOW: Uses session.activeOrganizationId with membership validation
   *
   * SECURITY:
   * - Validates user is still a member of the active organization
   * - Falls back to default selection if activeOrganizationId is invalid
   * - Never returns an organization user doesn't belong to
   *
   * MULTI-TENANCY: This is the source of truth for which org context
   * should be used throughout the application.
   *
   * SOURCE OF TRUTH KEYWORDS: ActiveOrganization, OrgSwitch, MultiTenancy
   */
  getActiveOrganization: protectedProcedure.query(async ({ ctx }) => {
    // Use cached context method (deduplicates with other server calls)
    const activeOrg = await ctx.getActiveOrganization()

    if (!activeOrg) {
      // No organizations - same handling as getUserOrganizations
      const pendingInvitation = await getUserPendingInvitation(ctx.user.email)

      if (pendingInvitation) {
        throw createStructuredError(
          'PRECONDITION_FAILED',
          'You have a pending invitation',
          {
            errorCode: ERROR_CODES.PENDING_INVITATION,
            invitationId: pendingInvitation.id,
            organizationId: pendingInvitation.organizationId,
            organizationName: pendingInvitation.organization.name,
            role: pendingInvitation.role || 'member',
            message: `You have been invited to join ${pendingInvitation.organization.name}`,
          }
        )
      }

      throw createStructuredError(
        'PRECONDITION_FAILED',
        'Please complete onboarding to access this feature',
        {
          errorCode: ERROR_CODES.ONBOARDING_INCOMPLETE,
          requiredStep: 'onboarding',
          message: "You don't have an organization. Please create an organization.",
        }
      )
    }

    return activeOrg
  }),

  /**
   * Get organization details
   *
   * Requires: organizationProcedure() already validated membership
   */
  getOrganizationDetails: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx }) => {
      // Procedure already validated everything!
      // Just return data from context
      // REMOVED: currentPlan - use getOrganizationTier() for subscription info
      return {
        id: ctx.organization.id,
        name: ctx.organization.name,
        slug: ctx.organization.slug,
        memberRole: ctx.memberRole,
      }
    }),

  /**
   * Delete organization
   *
   * Requires: studio-owner role (checked by procedure)
   */
  deleteOrganization: organizationProcedure({ requireRole: ['owner'] })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteOrganization(input.organizationId)

      return {
        success: true,
        message: 'Organization deleted',
      }
    }),

  /**
   * Invite member to organization
   *
   * Requires: invitation:create permission
   * FEATURE GATE: team_seats.limit (checked at procedure level)
   * SECURITY:
   * - Cannot invite as studio-owner
   * - Cannot invite existing members
   * - Cannot invite self
   */
  inviteMember: organizationProcedure({
    requirePermission: 'invitation:create',
    requireFeature: 'team_seats.limit',
  })
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email(),
        role: z.string(), // JSON string or "ROLENAME|||[permissions]"
      })
    )
    .mutation(async ({ ctx, input }) => {
      // SECURITY: Prevent inviting yourself
      if (ctx.user.email === input.email) {
        throw createStructuredError(
          'BAD_REQUEST',
          'You cannot invite yourself to the organization',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'You cannot invite yourself',
          }
        )
      }

      // Feature gate already checked at procedure level ✅

      // Call service to handle invitation
      const invitation = await inviteMemberToOrganization({
        organizationId: input.organizationId,
        organizationName: ctx.organization.name,
        inviterName: ctx.user.name || ctx.user.email,
        email: input.email,
        role: input.role,
      })

      // Increment usage after successful invitation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'team_seats.limit')

      return invitation
    }),

  /**
   * Cancel pending invitation
   *
   * Requires: invitation:cancel permission
   * USAGE: Decrements team_seats.limit when invitation is cancelled
   */
  cancelInvitation: organizationProcedure({ requirePermission: 'invitation:cancel' })
    .input(
      z.object({
        organizationId: z.string(),
        invitationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await cancelInvitation(input.organizationId, input.invitationId)

      // Decrement usage after cancelling invitation
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'team_seats.limit')

      return {
        success: true,
        message: 'Invitation cancelled',
      }
    }),

  /**
   * Resend pending invitation
   *
   * WHY: Allows resending invitation email to users who may have missed or lost the original
   * HOW: Cancels old invitation, creates new one with fresh expiration, sends new email
   *
   * Requires: invitation:create permission (same as creating new invitation)
   * NOTE: Does not affect team_seats.limit since it's a resend, not a new invitation
   */
  resendInvitation: organizationProcedure({ requirePermission: 'invitation:create' })
    .input(
      z.object({
        organizationId: z.string(),
        invitationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Resend invitation via service (handles cancel + recreate + email)
      const newInvitation = await resendInvitation({
        organizationId: input.organizationId,
        organizationName: ctx.organization.name,
        inviterName: ctx.user.name || ctx.user.email,
        invitationId: input.invitationId,
      })

      return {
        success: true,
        message: 'Invitation resent successfully',
        invitation: newInvitation,
      }
    }),

  /**
   * Get pending invitations for organization
   *
   * Requires: member:read permission (if you can see members, you can see invitations)
   */
  getPendingInvitations: organizationProcedure({ requirePermission: 'member:read' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const invitations = await getPendingInvitations(input.organizationId)

      return invitations
    }),

  /**
   * Get all custom roles for organization
   *
   * Returns all dynamic roles (excluding static roles like studio-owner)
   * Used for role selector in member invitation/editing
   *
   * Requires: member:read permission (if you can see members, you can see roles)
   */
  getOrganizationRoles: organizationProcedure({ requirePermission: 'member:read' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await getOrganizationRoles(input.organizationId)
    }),

  /**
   * Get all members for organization
   *
   * Returns all members (active + pending invitations) with their roles and permissions
   * Used for team management page
   *
   * Requires: member:read permission
   */
  getOrganizationMembers: organizationProcedure({ requirePermission: 'member:read' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      // Fetch active members via service
      const members = await getOrganizationMembersRaw(input.organizationId)

      // Fetch pending invitations
      const pendingInvitations = await getPendingInvitations(input.organizationId)

      // Enrich members with permissions
      const enrichedMembers = await Promise.all(
        members.map(async (member) => {
          // If studio-owner, no permissions to fetch (they have everything)
          if (member.role === 'owner') {
            return {
              id: member.id,
              user: {
                name: member.user.name || 'Unknown',
                email: member.user.email,
                image: member.user.image,
              },
              role: member.role,
              isPending: false,
              permissions: [],
              roleName: 'owner',
            }
          }

          // Fetch role permissions via service
          const organizationRole = await getRolePermission(input.organizationId, member.role)

          // Parse permissions
          const permissions: string[] = []
          let roleName = member.role

          if (organizationRole?.permission) {
            const permObj =
              typeof organizationRole.permission === 'string'
                ? JSON.parse(organizationRole.permission)
                : organizationRole.permission

            for (const [resource, actions] of Object.entries(permObj)) {
              if (
                Array.isArray(actions) &&
                resource !== 'organization' &&
                resource !== 'ac'
              ) {
                for (const action of actions) {
                  permissions.push(`${resource}:${action}`)
                }
              }
            }

            const parts = member.role.split('_')
            if (parts.length > 1) {
              roleName = parts.slice(1).join('_')
            }
          }

          return {
            id: member.id,
            user: {
              name: member.user.name || 'Unknown',
              email: member.user.email,
              image: member.user.image,
            },
            role: member.role,
            isPending: false,
            permissions,
            roleName,
          }
        })
      )

      // Add pending invitations as members
      const pendingMembers = pendingInvitations.map((invitation) => ({
        id: invitation.id,
        user: {
          name: invitation.email.split('@')[0],
          email: invitation.email,
          image: null,
        },
        role: invitation.role || 'member',
        isPending: true,
        permissions: [],
        roleName: invitation.role || 'member',
        invitationId: invitation.id,
      }))

      return [...enrichedMembers, ...pendingMembers]
    }),

  /**
   * Update member permissions
   *
   * Updates a member's role and permissions. If custom role, creates a new custom role.
   * If reusable role, assigns the member to that role.
   *
   * Requires: member:update permission
   */
  updateMemberPermissions: organizationProcedure({ requirePermission: 'member:update' })
    .input(
      z.object({
        organizationId: z.string(),
        memberId: z.string(),
        role: z.string(), // Role name or JSON string
        permissions: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /**
       * SECURITY: Validate member belongs to the claimed organization
       *
       * WHY: Without organizationId in WHERE, an attacker could update members
       * from other organizations by guessing/knowing member IDs.
       * The organizationProcedure only validates the user has permission in THEIR org,
       * not that the target member belongs to that org.
       */
      const member = await getOrganizationMember(input.organizationId, input.memberId)

      if (!member) {
        throw createStructuredError(
          'NOT_FOUND',
          'Member not found',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Member not found',
          }
        )
      }

      if (member.role === 'owner') {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot update studio owner role',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Studio owners cannot have their permissions changed',
          }
        )
      }

      // SECURITY: Cannot update self
      if (member.userId === ctx.user.id) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot update your own permissions',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'You cannot change your own permissions',
          }
        )
      }

      // Call service to update member role
      await updateMemberRole({
        memberId: input.memberId,
        organizationId: input.organizationId,
        role: input.role,
        permissions: input.permissions,
      })

      /**
       * REALTIME: Emit permission update event
       *
       * WHY: The affected user needs to refresh their permissions immediately
       * HOW: Client listens for this event and invalidates permission cache
       *
       * SECURITY: We don't send the actual permissions in the event.
       * The client must fetch fresh permissions from the server.
       * This prevents permission spoofing via websocket inspection.
       */
      await realtime.emit('permissions.memberUpdated', {
        organizationId: input.organizationId,
        targetUserId: member.userId,
        memberId: input.memberId,
        role: input.role,
        updatedAt: new Date().toISOString(),
      })

      return {
        success: true,
        message: 'Member permissions updated',
      }
    }),

  /**
   * Create organization role
   *
   * Creates a new reusable role in OrganizationRole table.
   * This role can then be assigned to multiple members.
   *
   * Requires: member:update permission
   */
  createOrganizationRole: organizationProcedure({
    requirePermission: 'member:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        roleName: z.string().min(1).max(50),
        permissions: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      // Validate role name
      const normalizedName = input.roleName.trim().toLowerCase().replace(/\s+/g, '-')

      // Check reserved names
      const reservedNames = ['admin', 'owner', 'client-owner', 'owner']
      if (reservedNames.includes(normalizedName)) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot use reserved role name',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `"${normalizedName}" is a reserved role name`,
          }
        )
      }

      // Check reserved prefixes
      if (normalizedName.startsWith('custom-')) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot use reserved prefix',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Role names cannot start with "custom-"',
          }
        )
      }

      // Create role name with org prefix (except for admin)
      const isAdminRole = normalizedName === 'admin'
      const roleNameInDb = isAdminRole
        ? 'admin'
        : `${input.organizationId.slice(0, 6).toLowerCase()}_${normalizedName}`

      // Convert permissions array to object format
      const permissionObject: Record<string, string[]> = {}
      for (const permission of input.permissions) {
        const [resource, action] = permission.split(':')
        if (!permissionObject[resource]) {
          permissionObject[resource] = []
        }
        permissionObject[resource].push(action)
      }

      // Create role via service
      const result = await createOrganizationRole({
        organizationId: input.organizationId,
        roleNameInDb,
        permissions: permissionObject,
      })

      if (result.exists) {
        throw createStructuredError(
          'BAD_REQUEST',
          'Role already exists',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `A role named "${normalizedName}" already exists in this organization`,
          }
        )
      }

      return {
        success: true,
        message: `Role "${normalizedName}" created successfully`,
        roleName: normalizedName,
        role: result.role,
      }
    }),

  /**
   * Update organization role permissions
   *
   * Updates permissions for a reusable role in OrganizationRole table.
   * This affects ALL members with this role.
   *
   * Requires: member:update permission
   */
  updateOrganizationRolePermissions: organizationProcedure({
    requirePermission: 'member:update',
  })
    .input(
      z.object({
        organizationId: z.string(),
        roleId: z.string(),
        permissions: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      // Convert permissions array to object format
      const permissionObject: Record<string, string[]> = {}
      for (const permission of input.permissions) {
        const [resource, action] = permission.split(':')
        if (!permissionObject[resource]) {
          permissionObject[resource] = []
        }
        permissionObject[resource].push(action)
      }

      // Update role permissions via service
      const result = await updateOrganizationRolePermissions({
        organizationId: input.organizationId,
        roleId: input.roleId,
        permissions: permissionObject,
      })

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Role not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Role not found',
        })
      }

      if ('wrongOrg' in result) {
        throw createStructuredError(
          'FORBIDDEN',
          'Role does not belong to this organization',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Cannot update role from another organization',
          }
        )
      }

      /**
       * REALTIME: Emit role updated event to ALL members with this role
       */
      const affectedMembers = await getMembersWithRole(input.organizationId, result.roleName)
      const affectedUserIds = affectedMembers.map((m) => m.userId)

      if (affectedUserIds.length > 0) {
        await realtime.emit('permissions.roleUpdated', {
          organizationId: input.organizationId,
          roleId: input.roleId,
          roleName: result.roleName,
          affectedUserIds,
          updatedAt: new Date().toISOString(),
        })
      }

      return {
        success: true,
        message: 'Role permissions updated',
        roleName: result.roleName,
      }
    }),

  /**
   * Delete organization role
   *
   * Deletes a reusable role from OrganizationRole table.
   * SECURITY:
   * - Cannot delete reserved roles (admin, studio-owner, etc.)
   * - Cannot delete custom roles (those with "custom-" prefix) - they're per-member
   * - Can only delete user-created named roles
   *
   * Requires: member:update permission
   */
  deleteOrganizationRole: organizationProcedure({ requirePermission: 'member:update' })
    .input(
      z.object({
        organizationId: z.string(),
        roleId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await deleteOrganizationRole(input.organizationId, input.roleId)

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Role not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Role not found',
        })
      }

      if ('wrongOrg' in result) {
        throw createStructuredError(
          'FORBIDDEN',
          'Role does not belong to this organization',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Cannot delete role from another organization',
          }
        )
      }

      if ('reserved' in result) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot delete reserved role',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `The role "${result.roleName}" is reserved and cannot be deleted`,
          }
        )
      }

      if ('customRole' in result) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot delete custom role',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              'Custom roles are managed per-member and cannot be deleted directly',
          }
        )
      }

      return {
        success: true,
        message: `Role "${result.roleName}" deleted successfully`,
        roleName: result.roleName,
      }
    }),

  /**
   * Remove organization member
   *
   * Removes a member from the organization. Cannot remove yourself or the owner.
   *
   * Requires: member:delete permission
   * USAGE: Decrements team_seats.limit when member is removed
   */
  removeMember: organizationProcedure({
    requirePermission: 'member:delete',
  })
    .input(
      z.object({
        organizationId: z.string(),
        memberId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Look up member (scoped to organization for defense-in-depth)
      const member = await getOrganizationMember(input.organizationId, input.memberId)

      if (!member) {
        throw createStructuredError('NOT_FOUND', 'Member not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Member not found',
        })
      }

      if (member.userId === ctx.user.id) {
        throw createStructuredError(
          'FORBIDDEN',
          'You cannot remove yourself',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'You cannot remove yourself from the organization',
          }
        )
      }

      // SECURITY: Prevent removing the studio owner
      if (
        member.role === 'owner' ||
        member.role === 'owner' ||
        member.role === 'client-owner'
      ) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot remove organization owner',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'The organization owner cannot be removed',
          }
        )
      }

      // Delete the member (scoped to org for defense-in-depth)
      await removeMember(input.organizationId, input.memberId)

      // Decrement usage after removing member
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'team_seats.limit')

      /**
       * REALTIME: Emit member removed event
       *
       * WHY: The removed user needs to know they lost access immediately
       * HOW: Client listens for this event and redirects them out of the org
       *
       * This prevents them from seeing "access denied" errors - instead
       * they get a clean redirect with a message explaining they were removed.
       */
      await realtime.emit('permissions.memberRemoved', {
        organizationId: input.organizationId,
        targetUserId: member.userId,
        memberId: input.memberId,
        removedAt: new Date().toISOString(),
      })

      return {
        success: true,
        message: 'Member removed successfully',
      }
    }),
})
