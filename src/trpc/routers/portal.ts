/**
 * Portal Router
 *
 * SOURCE OF TRUTH: Portal tRPC Endpoints
 * Thin controllers for portal operations.
 * All auth/permission checks happen in portalProcedure BEFORE this runs.
 *
 * ENDPOINTS (Simplified):
 * - Auth: checkPortalAdminStatus, getPortalAdminStatus, getCurrentAdmin
 * - Organizations: list, get, update, delete
 * - Users: list, get, ban/unban, delete
 * - Audit Logs: query
 */

import { z } from 'zod'
import { createTRPCRouter, createStructuredError, protectedProcedure } from '../init'
import { portalProcedure } from '../procedures'
import { ERROR_CODES } from '@/lib/errors'
import {
  getPortalOrganizations,
  getPortalOrganizationStatusCounts,
  getPortalOrganizationById,
  getPortalUsers,
  getPortalUserById,
  queryAuditLogs,
  createAuditLog,
  hasAnyPortalAdmins,
  createInitialPortalOwner,
  getPortalAdminByUserId,
  getMyPortalOrganization,
  hasPortalOrganization,
  updatePortalOrganization,
  deletePortalOrganization,
  banPortalUser,
  deletePortalUser,
} from '@/services/portal.service'
import {
  getPortalMRRData,
  getPortalActivityData,
  getPortalChurnData,
  getPortalFeesData,
  getPlatformCurrency,
  getOnboardingSurveyData,
} from '@/services/portal-analytics.service'
import { createStudioOrganization } from '@/services/organization.service'
import { portalConfig } from '@/lib/portal'
import type { PortalRoleType } from '@/lib/portal/types'

// ============================================================================
// PORTAL ROUTER
// ============================================================================

export const portalRouter = createTRPCRouter({
  // ==========================================================================
  // AUTH CHECK - Called after sign-in/sign-up to check portal admin status
  // ==========================================================================

  /**
   * Check Portal Admin Status
   *
   * SOURCE OF TRUTH: Portal Admin Auto-Creation on Sign-In
   *
   * WHY: Checks if the signed-in user should be redirected to the portal
   * HOW:
   * 1. If portal is disabled, returns { isPortalAdmin: false }
   * 2. If user already has portal admin record, returns { isPortalAdmin: true }
   * 3. If user email matches PORTAL_INITIAL_OWNER_EMAIL AND no admins exist,
   *    creates the initial owner and returns { isPortalAdmin: true }
   * 4. Otherwise returns { isPortalAdmin: false }
   *
   * SECURITY:
   * - Only creates admin if NO admins exist (prevents hijacking)
   * - Only creates admin if email EXACTLY matches ENV config
   * - Uses protectedProcedure (requires valid auth session)
   *
   * USAGE: Called by sign-in/sign-up forms after successful auth
   */
  checkPortalAdminStatus: protectedProcedure
    .mutation(async ({ ctx }) => {
      // If portal is disabled, user is not a portal admin
      if (!portalConfig.enabled) {
        return { isPortalAdmin: false, role: null }
      }

      // Check if user already has a portal admin record
      const existingAdmin = await getPortalAdminByUserId(ctx.user.id)
      if (existingAdmin) {
        // User is already a portal admin - check if active
        if (existingAdmin.isActive) {
          return { isPortalAdmin: true, role: existingAdmin.role }
        }
        // Admin exists but is inactive
        return { isPortalAdmin: false, role: null }
      }

      // Check if this is the initial owner email AND no admins exist yet
      const initialOwnerEmail = portalConfig.initialOwnerEmail?.toLowerCase()
      const userEmail = ctx.user.email?.toLowerCase()

      if (!initialOwnerEmail || !userEmail || initialOwnerEmail !== userEmail) {
        // User email doesn't match initial owner email
        return { isPortalAdmin: false, role: null }
      }

      // Email matches - check if any admins exist
      const hasAdmins = await hasAnyPortalAdmins()
      if (hasAdmins) {
        // Admins already exist - don't auto-create (prevents hijacking)
        return { isPortalAdmin: false, role: null }
      }

      // SECURITY: Create the initial portal owner
      // This only happens once - when the first matching email signs in
      try {
        const newAdmin = await createInitialPortalOwner(ctx.user.email, ctx.user.id)

        // Audit log the auto-creation
        await createAuditLog({
          portalAdminId: newAdmin.id,
          action: 'admin.create',
          resource: 'admins',
          resourceId: newAdmin.id,
          ipAddress: 'auth-flow',
          userAgent: 'auto-create',
          requestPath: '/api/trpc/portal.checkPortalAdminStatus',
          requestMethod: 'POST',
          newValue: { email: ctx.user.email, role: 'OWNER', autoCreated: true },
          metadata: { reason: 'Initial owner auto-creation on sign-in' },
        })

        return { isPortalAdmin: true, role: 'OWNER' as PortalRoleType }
      } catch (error) {
        console.error('[Portal] Failed to create initial owner:', error)
        return { isPortalAdmin: false, role: null }
      }
    }),

  /**
   * Get Portal Admin Status (Query - No Side Effects)
   *
   * SOURCE OF TRUTH: Portal Admin Status Check
   *
   * WHY: Allows UI components to check if user is a portal admin
   * HOW: Simply checks if user has an active portal admin record
   *
   * DIFFERENCE FROM checkPortalAdminStatus:
   * - This is a QUERY (cacheable, no side effects)
   * - Does NOT auto-create initial owner
   * - Used for UI display (team switcher, etc.)
   */
  getPortalAdminStatus: protectedProcedure
    .query(async ({ ctx }) => {
      // If portal is disabled, user is not a portal admin
      if (!portalConfig.enabled) {
        return { isPortalAdmin: false, role: null }
      }

      // Check if user has a portal admin record
      const admin = await getPortalAdminByUserId(ctx.user.id)

      if (admin && admin.isActive) {
        return { isPortalAdmin: true, role: admin.role }
      }

      return { isPortalAdmin: false, role: null }
    }),

  /**
   * Get Current Portal Admin
   *
   * WHY: Get the currently authenticated portal admin
   * HOW: Returns admin from context (set by portalProcedure)
   *
   * Requires: Any portal admin access
   */
  getCurrentAdmin: portalProcedure()
    .query(({ ctx }) => {
      return ctx.portalAdmin
    }),

  /**
   * Get My Portal Organization
   *
   * SOURCE OF TRUTH: Portal Owner's Organization
   *
   * WHY: Portal owners have their own organization with unlimited features.
   *      This endpoint allows them to quickly access their organization from the portal.
   *
   * HOW: Looks up the organization where:
   *      1. The current user is an owner member
   *      2. The organization has isPortalOrganization = true
   *
   * RETURNS:
   * - Organization details if found (with tier info showing "Portal" plan)
   * - null if the portal owner hasn't created their organization yet
   *
   * Requires: Any portal admin access (implicit - uses portalProcedure)
   */
  getMyPortalOrganization: portalProcedure()
    .query(async ({ ctx }) => {
      // Find the portal organization where the current user is an owner
      const portalOrg = await getMyPortalOrganization(ctx.user.id)

      if (!portalOrg) {
        return null
      }

      return {
        id: portalOrg.id,
        name: portalOrg.name,
        slug: portalOrg.slug,
        logo: portalOrg.logo,
        createdAt: portalOrg.createdAt,
        memberCount: portalOrg._count.members,
        websiteCount: portalOrg._count.websites,
        leadCount: portalOrg._count.leads,
        tier: 'Portal', // Always Portal tier for portal organizations
        isPortalOrganization: true,
      }
    }),

  /**
   * Create My Portal Organization
   *
   * SOURCE OF TRUTH: Portal Owner Organization Creation
   *
   * WHY: Portal owners need their own organization with unlimited features.
   *      This creates it directly without going through onboarding/payment.
   *
   * SECURITY:
   * - Only works for portal admins (portalProcedure enforces this)
   * - Only creates if user doesn't already have a portal organization
   * - Sets isPortalOrganization=true for unlimited tier access
   *
   * HOW: Creates organization with sensible defaults, user becomes owner
   */
  createMyPortalOrganization: portalProcedure()
    .input(
      z.object({
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has a portal organization
      const existingPortalOrg = await hasPortalOrganization(ctx.user.id)

      if (existingPortalOrg) {
        throw createStructuredError('BAD_REQUEST', 'Portal organization already exists', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'You already have a portal organization',
        })
      }

      // Create the organization with portal flag
      const result = await createStudioOrganization({
        userId: ctx.user.id,
        studioName: input.name,
        isPortalOrganization: true,
      })

      // Audit log
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'organization.create',
        resource: 'organizations',
        resourceId: result.organizationId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.createMyPortalOrganization',
        requestMethod: 'POST',
        newValue: { name: input.name, isPortalOrganization: true },
        metadata: { reason: 'Portal owner organization creation' },
      })

      return {
        success: true,
        organizationId: result.organizationId,
        slug: result.slug,
      }
    }),

  // ==========================================================================
  // ORGANIZATIONS
  // ==========================================================================

  /**
   * List Organizations
   *
   * WHY: Browse all organizations on the platform
   * HOW: Paginated list with optional search
   *
   * Requires: organizations:view permission
   */
  getOrganizations: portalProcedure({ requirePermission: 'organizations:view' })
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        /** Filter by organization subscription lifecycle status */
        statusFilter: z
          .enum(['all', 'trialing', 'active', 'cancelling', 'churned'])
          .default('all'),
      })
    )
    .query(async ({ input }) => {
      const result = await getPortalOrganizations({
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        statusFilter: input.statusFilter,
      })

      return {
        organizations: result.organizations,
        total: result.total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(result.total / input.pageSize),
      }
    }),

  /**
   * Get Organization Status Counts
   *
   * Returns counts for each status filter category (All, Trialing, Active, Cancelling, Churned).
   * Used by the portal organizations page to show badge counts on filter tabs.
   */
  getOrganizationStatusCounts: portalProcedure({ requirePermission: 'organizations:view' })
    .query(async () => {
      return await getPortalOrganizationStatusCounts()
    }),

  /**
   * Get Single Organization Details
   *
   * WHY: View detailed info about a specific organization
   * HOW: Returns org with members, subscription, and counts
   *
   * Requires: organizations:view permission
   */
  getOrganizationById: portalProcedure({ requirePermission: 'organizations:view' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const organization = await getPortalOrganizationById(input.organizationId)

      if (!organization) {
        throw createStructuredError('NOT_FOUND', 'Organization not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Organization not found',
        })
      }

      return organization
    }),

  /**
   * Update Organization
   *
   * WHY: Platform-level organization management
   * HOW: Updates org properties (name, settings, etc.)
   *
   * Requires: organizations:update permission
   */
  updateOrganization: portalProcedure({ requirePermission: 'organizations:update' })
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const organization = await updatePortalOrganization(input.organizationId, {
        name: input.name,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      })

      // Audit log
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'organization.update',
        resource: 'organizations',
        resourceId: input.organizationId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.updateOrganization',
        requestMethod: 'POST',
        newValue: { name: input.name },
      })

      return {
        success: true,
        message: 'Organization updated',
        organization,
      }
    }),

  /**
   * Delete Organization
   *
   * WHY: Remove problematic or inactive organizations
   * HOW: Hard delete - cascades to all related data
   *
   * SECURITY: Requires OWNER role - destructive action
   */
  deleteOrganization: portalProcedure({
    requirePermission: 'organizations:delete',
    requireRole: ['OWNER'],
  })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await deletePortalOrganization(input.organizationId)

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Organization not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Organization not found',
        })
      }

      // Audit log
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'organization.delete',
        resource: 'organizations',
        resourceId: input.organizationId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.deleteOrganization',
        requestMethod: 'POST',
        previousValue: { name: result.name },
      })

      return {
        success: true,
        message: 'Organization deleted',
      }
    }),

  // ==========================================================================
  // USERS
  // ==========================================================================

  /**
   * List Users
   *
   * WHY: Browse all users on the platform
   * HOW: Paginated list with optional search
   *
   * Requires: users:view permission
   */
  getUsers: portalProcedure({ requirePermission: 'users:view' })
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Exclude the current portal admin from the list (can't impersonate yourself)
      const result = await getPortalUsers({
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        excludeUserId: ctx.user.id,
      })

      return {
        users: result.users,
        total: result.total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(result.total / input.pageSize),
      }
    }),

  /**
   * Get Single User Details
   *
   * WHY: View detailed info about a specific user
   * HOW: Returns user with memberships and recent sessions
   *
   * Requires: users:view permission
   */
  getUserById: portalProcedure({ requirePermission: 'users:view' })
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await getPortalUserById(input.userId)

      if (!user) {
        throw createStructuredError('NOT_FOUND', 'User not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'User not found',
        })
      }

      return user
    }),

  /**
   * Ban User
   *
   * WHY: Prevent problematic users from accessing platform
   * HOW: Sets banned flag with optional reason
   *
   * Requires: users:update permission
   */
  banUser: portalProcedure({ requirePermission: 'users:update' })
    .input(
      z.object({
        userId: z.string(),
        banned: z.boolean(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await banPortalUser(input.userId, input.banned, input.reason)

      // Audit log
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: input.banned ? 'user.ban' : 'user.unban',
        resource: 'users',
        resourceId: input.userId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.banUser',
        requestMethod: 'POST',
        newValue: { banned: input.banned, reason: input.reason },
      })

      return {
        success: true,
        message: input.banned ? 'User banned' : 'User unbanned',
        user,
      }
    }),

  /**
   * Delete User
   *
   * WHY: Remove users (e.g., GDPR data deletion requests)
   * HOW: Hard delete - cascades to all related data
   *
   * SECURITY: Requires OWNER role - destructive action
   */
  deleteUser: portalProcedure({
    requirePermission: 'users:delete',
    requireRole: ['OWNER'],
  })
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await deletePortalUser(input.userId)

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'User not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'User not found',
        })
      }

      // Audit log
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'user.delete',
        resource: 'users',
        resourceId: input.userId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.deleteUser',
        requestMethod: 'POST',
        previousValue: { email: result.email },
      })

      return {
        success: true,
        message: 'User deleted',
      }
    }),

  // ==========================================================================
  // AUDIT LOGS
  // ==========================================================================

  /**
   * Query Audit Logs
   *
   * WHY: Review portal activity for compliance/security
   * HOW: Paginated query with filters
   *
   * Requires: audit-logs:view permission
   */
  getAuditLogs: portalProcedure({ requirePermission: 'audit-logs:view' })
    .input(
      z.object({
        portalAdminId: z.string().optional(),
        action: z.string().optional(),
        resource: z.string().optional(),
        resourceId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const result = await queryAuditLogs({
        portalAdminId: input.portalAdminId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        startDate: input.startDate,
        endDate: input.endDate,
        page: input.page,
        pageSize: input.pageSize,
      })

      return result
    }),

  // ==========================================================================
  // DASHBOARD ANALYTICS
  // ==========================================================================

  /**
   * Get Platform-Wide MRR Data
   *
   * SOURCE OF TRUTH: Portal MRR Analytics
   *
   * WHY: Shows total recurring revenue across all organizations
   * HOW: Aggregates RECURRING billing type transactions platform-wide
   *
   * Requires: Any portal admin access
   */
  getMRRData: portalProcedure()
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return getPortalMRRData(dateRange)
    }),

  /**
   * Get Platform-Wide Activity Data
   *
   * SOURCE OF TRUTH: Portal Activity Analytics
   *
   * WHY: Shows if the platform is being actively used
   * HOW: Aggregates sessions, leads, and transactions platform-wide
   *
   * Requires: Any portal admin access
   */
  getActivityData: portalProcedure()
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return getPortalActivityData(dateRange)
    }),

  /**
   * Get Platform-Wide Churn Data
   *
   * SOURCE OF TRUTH: Portal Churn Analytics
   *
   * WHY: Shows subscription/revenue churn across the platform
   * HOW: Tracks canceled subscriptions and transactions vs active ones
   *
   * Requires: Any portal admin access
   */
  getChurnData: portalProcedure()
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return getPortalChurnData(dateRange)
    }),

  /**
   * Get Platform Fees Data
   *
   * SOURCE OF TRUTH: Portal Fees Analytics
   *
   * WHY: Shows total platform fees earned from transactions
   * HOW: Calculates fees based on transaction amounts and org tiers
   *
   * Requires: Any portal admin access
   */
  getFeesData: portalProcedure()
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateRange =
        input.from && input.to ? { from: input.from, to: input.to } : undefined

      return getPortalFeesData(dateRange)
    }),

  /**
   * Get Platform Currency
   *
   * SOURCE OF TRUTH: Platform Stripe Account Currency
   *
   * WHY: Portal displays platform-wide revenue metrics. The currency should
   * match the platform's Stripe account currency for accurate display.
   *
   * HOW: Fetches the platform's Stripe account and returns its default_currency.
   *
   * Requires: Any portal admin access
   */
  getPlatformCurrency: portalProcedure()
    .query(async () => {
      return getPlatformCurrency()
    }),

  /**
   * Get Onboarding Survey Analytics
   *
   * SOURCE OF TRUTH: Portal Onboarding Survey Analytics
   *
   * WHY: Shows who our users are and where they come from
   * HOW: Aggregates referralSource, role, teamSize, intendedUse from Organization.metadata
   *
   * Requires: Any portal admin access
   */
  getOnboardingSurveyData: portalProcedure()
    .query(async () => {
      return getOnboardingSurveyData()
    }),

  // ==========================================================================
  // TEMPLATE APPROVAL
  // ==========================================================================

  /**
   * List templates awaiting portal approval (PENDING_APPROVAL status).
   * Used by the portal templates management page.
   *
   * Requires: templates:view permission
   */
  listPendingTemplates: portalProcedure({ requirePermission: 'templates:view' })
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const { listPendingApprovalTemplates } = await import('@/services/template.service')
      return listPendingApprovalTemplates({
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Approve a PENDING_APPROVAL template — sets status to PUBLISHED.
   * Portal admins use this to greenlight paid templates for the marketplace.
   *
   * Requires: templates:update permission
   */
  approveTemplate: portalProcedure({ requirePermission: 'templates:update' })
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { approveTemplate } = await import('@/services/template.service')
      const template = await approveTemplate(input.templateId)

      /** Audit log the approval */
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'template.approve',
        resource: 'templates',
        resourceId: input.templateId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.approveTemplate',
        requestMethod: 'POST',
        newValue: { templateId: input.templateId, status: 'PUBLISHED' },
      })

      return { success: true, template }
    }),

  /**
   * Reject a PENDING_APPROVAL template — resets status to DRAFT.
   * Portal admins use this to deny paid templates from the marketplace.
   *
   * Requires: templates:update permission
   */
  rejectTemplate: portalProcedure({ requirePermission: 'templates:update' })
    .input(
      z.object({
        templateId: z.string(),
        /** Optional reason for rejection — stored in audit log */
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { rejectTemplate } = await import('@/services/template.service')
      const template = await rejectTemplate(input.templateId, input.reason)

      /** Audit log the rejection with reason */
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'template.reject',
        resource: 'templates',
        resourceId: input.templateId,
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.rejectTemplate',
        requestMethod: 'POST',
        newValue: { templateId: input.templateId, status: 'DRAFT', reason: input.reason },
      })

      return { success: true, template }
    }),

  /**
   * Get the auto-approve setting for template publishing.
   * When enabled, paid templates skip the approval queue.
   *
   * Requires: templates:view permission
   */
  getAutoApproveSetting: portalProcedure({ requirePermission: 'templates:view' })
    .query(async () => {
      const { getPortalSetting } = await import('@/services/template.service')
      const value = await getPortalSetting('templates.autoApprove')
      return { autoApprove: value === 'true' }
    }),

  /**
   * Toggle the auto-approve setting for template publishing.
   * When set to true, paid templates are published immediately without review.
   *
   * Requires: templates:update permission
   */
  setAutoApproveSetting: portalProcedure({ requirePermission: 'templates:update' })
    .input(z.object({ autoApprove: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { setPortalSetting } = await import('@/services/template.service')
      await setPortalSetting(
        'templates.autoApprove',
        input.autoApprove ? 'true' : 'false',
        'templates'
      )

      /** Audit log the setting change */
      await createAuditLog({
        portalAdminId: ctx.portalAdmin.id,
        action: 'settings.update',
        resource: 'settings',
        ipAddress: 'tRPC',
        userAgent: 'tRPC',
        requestPath: '/api/trpc/portal.setAutoApproveSetting',
        requestMethod: 'POST',
        newValue: { 'templates.autoApprove': input.autoApprove },
      })

      return { success: true, autoApprove: input.autoApprove }
    }),
})
