/**
 * Portal Service (DAL)
 *
 * SOURCE OF TRUTH: Portal Data Access Layer
 * Pure data access layer for portal operations.
 * NO business logic - just database queries.
 */

import { prisma } from '@/lib/config'
import {
  portalConfig,
  getPortalSessionExpiry,
  hashToken,
  generateSecureToken,
} from '@/lib/portal'
import type {
  PortalRoleType,
  PortalAdminWithUser,
  PortalSessionWithAdmin,
  PortalSessionValidationResult,
  CreateAuditLogOptions,
  PortalDashboardStats,
  PortalOrganizationView,
  PortalOrganizationStatusFilter,
  PortalUserView,
} from '@/lib/portal/types'

// ============================================================================
// PORTAL ADMIN QUERIES
// ============================================================================

/**
 * Get portal admin by email
 */
export async function getPortalAdminByEmail(
  email: string
): Promise<PortalAdminWithUser | null> {
  const admin = await prisma.portalAdmin.findUnique({
    where: { email },
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
  })

  return admin as PortalAdminWithUser | null
}

/**
 * Get portal admin by ID
 */
export async function getPortalAdminById(
  id: string
): Promise<PortalAdminWithUser | null> {
  const admin = await prisma.portalAdmin.findUnique({
    where: { id },
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
  })

  return admin as PortalAdminWithUser | null
}

/**
 * Get portal admin by user ID
 */
export async function getPortalAdminByUserId(
  userId: string
): Promise<PortalAdminWithUser | null> {
  const admin = await prisma.portalAdmin.findUnique({
    where: { userId },
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
  })

  return admin as PortalAdminWithUser | null
}

/**
 * Check if any portal admins exist
 */
export async function hasAnyPortalAdmins(): Promise<boolean> {
  const count = await prisma.portalAdmin.count()
  return count > 0
}

/**
 * Create initial portal owner from ENV config
 * Called when first portal admin needs to be created
 *
 * IMPORTANT: Also sets User.role = 'admin' for better-auth admin plugin
 * This enables impersonation functionality via better-auth's native API
 */
export async function createInitialPortalOwner(
  email: string,
  userId?: string
): Promise<PortalAdminWithUser> {
  // Use transaction to create PortalAdmin AND set User.role atomically
  const admin = await prisma.$transaction(async (tx) => {
    // Create the portal admin record
    const portalAdmin = await tx.portalAdmin.create({
      data: {
        email,
        userId,
        role: 'OWNER',
        isActive: true,
      },
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
    })

    // CRITICAL: Set User.role to 'admin' for better-auth impersonation
    // This allows the user to use authClient.admin.impersonateUser()
    if (userId) {
      await tx.user.update({
        where: { id: userId },
        data: { role: 'admin' },
      })
    }

    return portalAdmin
  })

  return admin as PortalAdminWithUser
}

/**
 * Create a new portal admin
 *
 * IMPORTANT: Also sets User.role = 'admin' for better-auth admin plugin
 * This enables impersonation functionality via better-auth's native API
 */
export async function createPortalAdmin(params: {
  email: string
  role: PortalRoleType
  userId?: string
  displayName?: string
  invitedBy: string
}): Promise<PortalAdminWithUser> {
  // Use transaction to create PortalAdmin AND set User.role atomically
  const admin = await prisma.$transaction(async (tx) => {
    const portalAdmin = await tx.portalAdmin.create({
      data: {
        email: params.email,
        role: params.role,
        userId: params.userId,
        displayName: params.displayName,
        invitedBy: params.invitedBy,
        invitedAt: new Date(),
        isActive: true,
      },
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
    })

    // CRITICAL: Set User.role to 'admin' for better-auth impersonation
    if (params.userId) {
      await tx.user.update({
        where: { id: params.userId },
        data: { role: 'admin' },
      })
    }

    return portalAdmin
  })

  return admin as PortalAdminWithUser
}

/**
 * Update portal admin
 */
export async function updatePortalAdmin(
  id: string,
  data: {
    role?: PortalRoleType
    displayName?: string
    avatarUrl?: string
    isActive?: boolean
  }
) {
  return prisma.portalAdmin.update({
    where: { id },
    data,
  })
}

/**
 * Delete portal admin
 *
 * IMPORTANT: Also removes User.role = 'admin' to revoke impersonation access
 */
export async function deletePortalAdmin(id: string) {
  // Use transaction to delete PortalAdmin AND remove User.role atomically
  return prisma.$transaction(async (tx) => {
    // First get the portal admin to find the userId
    const portalAdmin = await tx.portalAdmin.findUnique({
      where: { id },
      select: { userId: true },
    })

    // Delete the portal admin record
    const deleted = await tx.portalAdmin.delete({
      where: { id },
    })

    // Remove 'admin' role from User to revoke impersonation access
    if (portalAdmin?.userId) {
      await tx.user.update({
        where: { id: portalAdmin.userId },
        data: { role: null },
      })
    }

    return deleted
  })
}

/**
 * Get all portal admins
 */
export async function getAllPortalAdmins(): Promise<PortalAdminWithUser[]> {
  const admins = await prisma.portalAdmin.findMany({
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
    orderBy: {
      createdAt: 'desc',
    },
  })

  return admins as PortalAdminWithUser[]
}

// ============================================================================
// PORTAL SESSION QUERIES
// ============================================================================

/**
 * Create a new portal session
 */
export async function createPortalSession(params: {
  portalAdminId: string
  ipAddress: string
  userAgent: string
  deviceInfo?: string
}): Promise<{ session: PortalSessionWithAdmin; token: string }> {
  const token = generateSecureToken(32)
  const tokenHash = hashToken(token)

  const session = await prisma.portalSession.create({
    data: {
      portalAdminId: params.portalAdminId,
      tokenHash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceInfo: params.deviceInfo,
      expiresAt: getPortalSessionExpiry(),
      lastActivityAt: new Date(),
    },
    include: {
      portalAdmin: true,
    },
  })

  // Update admin's last login info
  await prisma.portalAdmin.update({
    where: { id: params.portalAdminId },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: params.ipAddress,
    },
  })

  return { session: session as PortalSessionWithAdmin, token }
}

/**
 * Validate a portal session token
 */
export async function validatePortalSession(
  token: string
): Promise<PortalSessionValidationResult> {
  if (!portalConfig.enabled) {
    return {
      valid: false,
      error: 'Portal is disabled',
      errorCode: 'PORTAL_DISABLED',
    }
  }

  if (!token) {
    return {
      valid: false,
      error: 'Session token is required',
      errorCode: 'INVALID_TOKEN',
    }
  }

  const tokenHash = hashToken(token)

  const session = await prisma.portalSession.findUnique({
    where: { tokenHash },
    include: {
      portalAdmin: {
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
      },
    },
  })

  if (!session) {
    return {
      valid: false,
      error: 'Session not found',
      errorCode: 'SESSION_NOT_FOUND',
    }
  }

  if (session.isRevoked) {
    return {
      valid: false,
      error: 'Session has been revoked',
      errorCode: 'SESSION_REVOKED',
    }
  }

  if (new Date() > session.expiresAt) {
    return {
      valid: false,
      error: 'Session has expired',
      errorCode: 'SESSION_EXPIRED',
    }
  }

  if (!session.portalAdmin.isActive) {
    return {
      valid: false,
      error: 'Admin account is inactive',
      errorCode: 'ADMIN_INACTIVE',
    }
  }

  // Update last activity (non-blocking)
  prisma.portalSession
    .update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => {})

  return {
    valid: true,
    session: session as PortalSessionWithAdmin,
    admin: session.portalAdmin as PortalAdminWithUser,
  }
}

/**
 * Revoke a portal session
 */
export async function revokePortalSession(
  sessionId: string,
  reason?: string
) {
  return prisma.portalSession.update({
    where: { id: sessionId },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })
}

/**
 * Revoke all sessions for a portal admin
 */
export async function revokeAllAdminSessions(
  portalAdminId: string,
  reason: string
): Promise<number> {
  const result = await prisma.portalSession.updateMany({
    where: {
      portalAdminId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  return result.count
}

/**
 * Get active sessions for a portal admin
 */
export async function getAdminActiveSessions(portalAdminId: string) {
  return prisma.portalSession.findMany({
    where: {
      portalAdminId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: {
      lastActivityAt: 'desc',
    },
  })
}

/**
 * Cleanup expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.portalSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        {
          isRevoked: true,
          revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      ],
    },
  })

  return result.count
}

// ============================================================================
// PORTAL AUDIT LOG QUERIES
// ============================================================================

/**
 * Create an audit log entry
 */
export async function createAuditLog(options: CreateAuditLogOptions) {
  if (!portalConfig.auditLoggingEnabled) {
    return null
  }

  try {
    return await prisma.portalAuditLog.create({
      data: {
        portalAdminId: options.portalAdminId,
        action: options.action,
        resource: options.resource,
        resourceId: options.resourceId,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        requestPath: options.requestPath,
        requestMethod: options.requestMethod,
        previousValue: options.previousValue
          ? JSON.stringify(options.previousValue)
          : null,
        newValue: options.newValue ? JSON.stringify(options.newValue) : null,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
        success: options.success ?? true,
        errorMessage: options.errorMessage,
        targetAdminId: options.targetAdminId,
      },
    })
  } catch (error) {
    console.error('[Portal Audit] Failed to create audit log:', error)
    return null
  }
}

/**
 * Query audit logs with pagination
 */
export async function queryAuditLogs(params: {
  portalAdminId?: string
  action?: string
  resource?: string
  resourceId?: string
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}) {
  const {
    portalAdminId,
    action,
    resource,
    resourceId,
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
  } = params

  const where: Record<string, unknown> = {}

  if (portalAdminId) where.portalAdminId = portalAdminId
  if (action) where.action = action
  if (resource) where.resource = resource
  if (resourceId) where.resourceId = resourceId

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) (where.createdAt as Record<string, Date>).gte = startDate
    if (endDate) (where.createdAt as Record<string, Date>).lte = endDate
  }

  const [logs, total] = await Promise.all([
    prisma.portalAuditLog.findMany({
      where,
      include: {
        portalAdmin: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
          },
        },
        targetAdmin: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.portalAuditLog.count({ where }),
  ])

  return {
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

// ============================================================================
// PORTAL INVITATION QUERIES
// ============================================================================

/**
 * Create a portal invitation
 */
export async function createPortalInvitation(params: {
  email: string
  role: PortalRoleType
  invitedBy: string
  expiresInDays?: number
}): Promise<{ invitation: unknown; token: string }> {
  const token = generateSecureToken(32)
  const tokenHash = hashToken(token)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays || 7))

  const invitation = await prisma.portalInvitation.create({
    data: {
      email: params.email,
      role: params.role,
      tokenHash,
      expiresAt,
      invitedBy: params.invitedBy,
    },
  })

  return { invitation, token }
}

/**
 * Get portal invitation by token
 */
export async function getPortalInvitationByToken(token: string) {
  const tokenHash = hashToken(token)

  return prisma.portalInvitation.findUnique({
    where: { tokenHash },
  })
}

/**
 * Accept a portal invitation
 */
export async function acceptPortalInvitation(invitationId: string) {
  return prisma.portalInvitation.update({
    where: { id: invitationId },
    data: { acceptedAt: new Date() },
  })
}

/**
 * Delete a portal invitation
 */
export async function deletePortalInvitation(id: string) {
  return prisma.portalInvitation.delete({
    where: { id },
  })
}

// ============================================================================
// PLATFORM STATISTICS QUERIES
// ============================================================================

/**
 * Get platform-wide dashboard statistics
 */
export async function getPortalDashboardStats(): Promise<PortalDashboardStats> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalOrgs,
    newOrgsThisMonth,
    totalUsers,
    newUsersThisMonth,
    subscriptionStats,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.subscription.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
  ])

  // Parse subscription stats
  const subStats = {
    total: 0,
    active: 0,
    trialing: 0,
    pastDue: 0,
    canceled: 0,
  }

  for (const stat of subscriptionStats) {
    subStats.total += stat._count.status
    if (stat.status === 'active') subStats.active = stat._count.status
    if (stat.status === 'trialing') subStats.trialing = stat._count.status
    if (stat.status === 'past_due') subStats.pastDue = stat._count.status
    if (stat.status === 'canceled') subStats.canceled = stat._count.status
  }

  return {
    organizations: {
      total: totalOrgs,
      active: totalOrgs, // Could add active calculation based on recent activity
      newThisMonth: newOrgsThisMonth,
    },
    users: {
      total: totalUsers,
      active: totalUsers,
      newThisMonth: newUsersThisMonth,
    },
    subscriptions: subStats,
    revenue: {
      mrr: 0, // Calculate from Stripe if needed
      arr: 0,
    },
  }
}

/**
 * Get organizations for portal listing
 *
 * Birds-eye view showing only what matters:
 * - Subscription status (revenue)
 * - Stripe Connect health (can accept payments)
 * - Email capability (can engage users)
 */
/**
 * Build Prisma where clause for organization status filtering.
 *
 * SOURCE OF TRUTH: buildStatusFilterWhere, portal-org-status-filter
 *
 * Used by both getPortalOrganizations (for filtered list) and
 * getPortalOrganizationStatusCounts (for tab badge counts).
 *
 * Filter logic:
 * - 'all': No additional filter
 * - 'trialing': Has subscription with status 'trialing' OR no subscription and never churned
 * - 'active': Has subscription with status 'active' and NOT cancelling at period end
 * - 'cancelling': Has subscription with cancelAtPeriodEnd=true
 * - 'churned': churnedAt is set and no active subscription record
 */
function buildStatusFilterWhere(statusFilter?: PortalOrganizationStatusFilter): Record<string, unknown> {
  switch (statusFilter) {
    case 'trialing':
      // Organizations on trial OR free tier (never paid, never churned)
      return {
        OR: [
          { subscriptions: { some: { status: 'trialing' } } },
          { subscriptions: { none: {} }, churnedAt: null },
        ],
      }
    case 'active':
      // Paid active subscriptions that are NOT set to cancel
      return {
        subscriptions: { some: { status: 'active', cancelAtPeriodEnd: false } },
      }
    case 'cancelling':
      // Active subscriptions that will cancel at period end
      return {
        subscriptions: { some: { cancelAtPeriodEnd: true } },
      }
    case 'churned':
      // Had a subscription that was cancelled — churnedAt is set, no subscription record
      return {
        churnedAt: { not: null },
        subscriptions: { none: {} },
      }
    default:
      // 'all' or undefined — no additional filter
      return {}
  }
}

/**
 * Get organizations for portal listing with optional status filtering.
 *
 * SOURCE OF TRUTH: getPortalOrganizations, portal-org-list
 *
 * Returns paginated list of organizations with subscription info, health
 * indicators, and portal organization flags. Supports search by name/slug
 * and filtering by subscription lifecycle status.
 */
export async function getPortalOrganizations(params: {
  search?: string
  page?: number
  pageSize?: number
  statusFilter?: PortalOrganizationStatusFilter
}): Promise<{ organizations: PortalOrganizationView[]; total: number }> {
  const { search, page = 1, pageSize = 20, statusFilter } = params

  // Combine search and status filter into a single where clause
  const searchWhere: Record<string, unknown> = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const statusWhere = buildStatusFilterWhere(statusFilter)

  // Merge both where clauses — AND them together
  const where: Record<string, unknown> =
    Object.keys(searchWhere).length > 0 && Object.keys(statusWhere).length > 0
      ? { AND: [searchWhere, statusWhere] }
      : { ...searchWhere, ...statusWhere }

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: {
        _count: {
          select: {
            members: true,
            // Check if org has any verified email domains (verifiedAt is set)
            emailDomains: { where: { verifiedAt: { not: null } } },
          },
        },
        // Include ALL subscriptions (not filtered by status) — we delete cancelled ones now
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // Include organization owner for impersonation feature in portal
        members: {
          where: { role: 'owner' },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.organization.count({ where }),
  ])

  const mapped: PortalOrganizationView[] = organizations.map((org) => {
    // Determine Stripe health status
    let stripeStatus: 'connected' | 'restricted' | 'none' = 'none'
    if (org.stripeConnectedAccountId) {
      stripeStatus = org.stripeAccountRestricted ? 'restricted' : 'connected'
    }

    const sub = org.subscriptions[0]

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      memberCount: org._count.members,
      owner: org.members[0]?.user ?? null,
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            periodEnd: sub.periodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      health: {
        stripe: stripeStatus,
        emailEnabled: org._count.emailDomains > 0,
      },
      createdAt: org.createdAt,
      isPortalOrganization: org.isPortalOrganization ?? undefined,
      // churnedAt may not exist in Prisma types yet — field added to schema, pending prisma generate
      churnedAt: 'churnedAt' in org ? (org as { churnedAt: Date | null }).churnedAt : null,
    }
  })

  return { organizations: mapped, total }
}

/**
 * Get organization counts for each status filter category.
 *
 * SOURCE OF TRUTH: getPortalOrganizationStatusCounts, portal-org-counts
 *
 * Returns counts for All, Trialing, Active, Cancelling, and Churned categories.
 * Used by the portal organizations page to show badge counts on filter tabs.
 */
export async function getPortalOrganizationStatusCounts(): Promise<{
  all: number
  trialing: number
  active: number
  cancelling: number
  churned: number
}> {
  const [all, trialing, active, cancelling, churned] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: buildStatusFilterWhere('trialing') }),
    prisma.organization.count({ where: buildStatusFilterWhere('active') }),
    prisma.organization.count({ where: buildStatusFilterWhere('cancelling') }),
    prisma.organization.count({ where: buildStatusFilterWhere('churned') }),
  ])

  return { all, trialing, active, cancelling, churned }
}

/**
 * Get users for portal listing
 *
 * Includes firstOrganizationSlug for impersonation redirect to correct subdomain
 *
 * @param params.excludeUserId - Optional user ID to exclude (e.g. the portal admin viewing the list)
 */
export async function getPortalUsers(params: {
  search?: string
  page?: number
  pageSize?: number
  excludeUserId?: string
}): Promise<{ users: PortalUserView[]; total: number }> {
  const { search, page = 1, pageSize = 20, excludeUserId } = params

  const where: Record<string, unknown> = {}

  // Exclude the portal admin from the list (they can't impersonate themselves)
  if (excludeUserId) {
    where.id = { not: excludeUserId }
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        _count: { select: { members: true } },
        // Include first organization for impersonation redirect
        members: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          include: {
            organization: {
              select: { slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ])

  const mapped: PortalUserView[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    emailVerified: user.emailVerified,
    banned: user.banned ?? false,
    banReason: user.banReason,
    organizationCount: user._count.members,
    // Get first organization slug for impersonation subdomain redirect
    firstOrganizationSlug: user.members[0]?.organization?.slug ?? null,
    createdAt: user.createdAt,
  }))

  return { users: mapped, total }
}

/**
 * Get single organization details for portal
 */
export async function getPortalOrganizationById(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: {
      members: {
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
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          leads: true,
          websites: true,
          forms: true,
          products: true,
        },
      },
    },
  })
}

/**
 * Get single user details for portal
 */
export async function getPortalUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
            },
          },
        },
      },
      sessions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  })
}

// ============================================================================
// PORTAL ORGANIZATION MANAGEMENT
// ============================================================================
// SOURCE OF TRUTH: PortalOrgManagement, PortalOrgCRUD

/**
 * Get portal organization owned by a specific user.
 *
 * WHY: Portal owners have a dedicated organization with unlimited features.
 * HOW: Finds org where isPortalOrganization=true and user is owner.
 *
 * SOURCE OF TRUTH: PortalOwnerOrganization
 */
export async function getMyPortalOrganization(userId: string) {
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
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      createdAt: true,
      _count: {
        select: {
          members: true,
          websites: true,
          leads: true,
        },
      },
    },
  })
}

/**
 * Check if user already has a portal organization.
 *
 * WHY: Only one portal organization allowed per portal owner.
 * HOW: Checks for isPortalOrganization=true org where user is owner.
 *
 * SOURCE OF TRUTH: PortalOrgExistenceCheck
 */
export async function hasPortalOrganization(userId: string) {
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
    select: { id: true },
  })
}

/**
 * Update a portal organization's properties.
 *
 * WHY: Platform-level organization management by portal admins.
 * HOW: Updates name and/or metadata fields.
 *
 * SOURCE OF TRUTH: PortalOrgUpdate
 */
export async function updatePortalOrganization(
  organizationId: string,
  data: { name?: string; metadata?: string }
) {
  return await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.metadata && { metadata: data.metadata }),
    },
  })
}

/**
 * Delete a portal organization (hard delete).
 *
 * WHY: Remove problematic or inactive organizations from the platform.
 * HOW: Verifies org exists, then hard deletes (cascades to all related data).
 *
 * SOURCE OF TRUTH: PortalOrgDelete
 *
 * @returns null if not found, or { name } of deleted org
 */
export async function deletePortalOrganization(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })

  if (!org) {
    return null
  }

  await prisma.organization.delete({
    where: { id: organizationId },
  })

  return { name: org.name }
}

// ============================================================================
// PORTAL USER MANAGEMENT
// ============================================================================
// SOURCE OF TRUTH: PortalUserManagement, PortalUserCRUD

/**
 * Ban or unban a platform user.
 *
 * WHY: Prevent problematic users from accessing the platform.
 * HOW: Sets banned flag and optional reason on the user record.
 *
 * SOURCE OF TRUTH: PortalUserBan
 */
export async function banPortalUser(
  userId: string,
  banned: boolean,
  reason?: string
) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      banned,
      banReason: banned ? reason : null,
    },
  })
}

/**
 * Delete a platform user (hard delete).
 *
 * WHY: Remove users (e.g., GDPR data deletion requests).
 * HOW: Verifies user exists, then hard deletes (cascades to all related data).
 *
 * SOURCE OF TRUTH: PortalUserDelete
 *
 * @returns null if not found, or { email } of deleted user
 */
export async function deletePortalUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!user) {
    return null
  }

  await prisma.user.delete({
    where: { id: userId },
  })

  return { email: user.email }
}
