/**
 * Portal Type Definitions
 *
 * SOURCE OF TRUTH: Portal Types
 * All type definitions for the Client Portal feature.
 * These types match the Prisma schema definitions.
 */

// ============================================================================
// PORTAL ROLE TYPES (MATCHES PRISMA ENUM)
// ============================================================================

/**
 * Portal role types - matches PortalRoleType enum in Prisma schema
 */
export type PortalRoleType = 'OWNER' | 'ADMIN' | 'SUPPORT' | 'VIEWER'

// ============================================================================
// PORTAL ADMIN TYPES
// ============================================================================

/**
 * Portal admin user - matches PortalAdmin model in Prisma schema
 */
export interface PortalAdmin {
  id: string
  email: string
  userId: string | null
  role: PortalRoleType
  displayName: string | null
  avatarUrl: string | null
  isActive: boolean
  lastLoginAt: Date | null
  lastLoginIp: string | null
  invitedBy: string | null
  invitedAt: Date | null
  portalTwoFactorEnabled: boolean
  portalTwoFactorSecret: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Portal admin with user relation
 */
export interface PortalAdminWithUser extends PortalAdmin {
  user: {
    id: string
    name: string
    email: string
    image: string | null
  } | null
}

// ============================================================================
// PORTAL SESSION TYPES
// ============================================================================

/**
 * Portal session - matches PortalSession model in Prisma schema
 */
export interface PortalSession {
  id: string
  portalAdminId: string
  tokenHash: string
  ipAddress: string
  userAgent: string
  deviceInfo: string | null
  expiresAt: Date
  lastActivityAt: Date
  isRevoked: boolean
  revokedAt: Date | null
  revokedReason: string | null
  createdAt: Date
}

/**
 * Portal session with admin relation
 */
export interface PortalSessionWithAdmin extends PortalSession {
  portalAdmin: PortalAdmin
}

// ============================================================================
// PORTAL CONTEXT TYPES
// ============================================================================

/**
 * Portal context available in protected portal routes and tRPC procedures
 */
export interface PortalContext {
  admin: PortalAdminWithUser
  session: PortalSession
}

// ============================================================================
// PORTAL PERMISSION TYPES
// ============================================================================

/**
 * Portal resources for permission checks
 */
export type PortalResource =
  | 'organizations'
  | 'users'
  | 'subscriptions'
  | 'analytics'
  | 'settings'
  | 'admins'
  | 'audit-logs'
  | 'invitations'
  | 'templates'

/**
 * Portal actions
 */
export type PortalAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'impersonate'
  | 'export'

/**
 * Portal permission string format
 */
export type PortalPermission = `${PortalResource}:${PortalAction}`

// ============================================================================
// PORTAL SESSION ERROR CODES
// ============================================================================

export type PortalSessionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'ADMIN_INACTIVE'
  | 'ADMIN_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'PORTAL_DISABLED'

/**
 * Result of validating a portal session
 */
export interface PortalSessionValidationResult {
  valid: boolean
  session?: PortalSessionWithAdmin
  admin?: PortalAdminWithUser
  error?: string
  errorCode?: PortalSessionErrorCode
}

// ============================================================================
// PORTAL AUDIT LOG TYPES
// ============================================================================

/**
 * Portal audit action types
 */
export type PortalAuditAction =
  | 'session.create'
  | 'session.destroy'
  | 'session.revoke'
  | 'organization.view'
  | 'organization.create'
  | 'organization.update'
  | 'organization.delete'
  | 'organization.suspend'
  | 'organization.unsuspend'
  | 'organization.impersonate'
  | 'user.view'
  | 'user.update'
  | 'user.delete'
  | 'user.ban'
  | 'user.unban'
  | 'subscription.view'
  | 'subscription.update'
  | 'subscription.cancel'
  | 'admin.create'
  | 'admin.update'
  | 'admin.delete'
  | 'admin.deactivate'
  | 'admin.activate'
  | 'invitation.create'
  | 'invitation.cancel'
  | 'invitation.accept'
  | 'settings.view'
  | 'settings.update'
  | 'analytics.view'
  | 'analytics.export'
  | 'template.approve'
  | 'template.reject'

/**
 * Options for creating an audit log entry
 */
export interface CreateAuditLogOptions {
  portalAdminId: string
  action: PortalAuditAction
  resource: PortalResource | string
  resourceId?: string
  ipAddress: string
  userAgent: string
  requestPath: string
  requestMethod: string
  previousValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  metadata?: Record<string, unknown>
  success?: boolean
  errorMessage?: string
  targetAdminId?: string
}

// ============================================================================
// PORTAL INVITATION TYPES
// ============================================================================

/**
 * Portal invitation - matches PortalInvitation model
 */
export interface PortalInvitation {
  id: string
  email: string
  role: PortalRoleType
  tokenHash: string
  expiresAt: Date
  acceptedAt: Date | null
  invitedBy: string
  createdAt: Date
}

// ============================================================================
// PORTAL STATISTICS TYPES
// ============================================================================

/**
 * Platform-wide statistics for portal dashboard
 */
export interface PortalDashboardStats {
  organizations: {
    total: number
    active: number
    newThisMonth: number
  }
  users: {
    total: number
    active: number
    newThisMonth: number
  }
  subscriptions: {
    total: number
    active: number
    trialing: number
    pastDue: number
    canceled: number
  }
  revenue: {
    mrr: number
    arr: number
  }
}

/**
 * Organization details for portal view
 *
 * SOURCE OF TRUTH: Portal Organization List View
 * Birds-eye view of org health: revenue, payments, email capability
 */
export interface PortalOrganizationView {
  id: string
  name: string
  slug: string
  logo: string | null
  memberCount: number
  /** Organization owner — used for impersonation in the portal */
  owner: {
    id: string
    name: string
    email: string
    image: string | null
  } | null
  /** Subscription info - null means free tier (never paid or churned) */
  subscription: {
    plan: string
    status: string
    periodEnd: Date | null
    /** Whether the subscription is set to cancel at period end */
    cancelAtPeriodEnd: boolean
  } | null
  /** Critical health indicators */
  health: {
    /** Stripe Connect: 'connected' | 'restricted' | 'none' */
    stripe: 'connected' | 'restricted' | 'none'
    /** Can send emails (has verified domain) */
    emailEnabled: boolean
  }
  createdAt: Date
  /**
   * Whether this is a portal organization (belongs to portal owner)
   * Portal organizations have unlimited features via the hidden 'portal' tier
   */
  isPortalOrganization?: boolean
  /**
   * When the organization's paid subscription was cancelled (churned).
   * null = never had a paid subscription or currently active.
   * Set by handleSubscriptionDeleted(), cleared when re-subscribing.
   */
  churnedAt: Date | null
}

/**
 * SOURCE OF TRUTH: PortalOrganizationStatusFilter
 *
 * Filter categories for the portal organizations page.
 * - 'all': No filter, show everything
 * - 'trialing': Organizations with subscription status 'trialing' OR no subscription and never churned (free tier)
 * - 'active': Organizations with subscription status 'active' (paid plans only, not cancelling)
 * - 'cancelling': Organizations where cancelAtPeriodEnd=true (still active but will cancel at period end)
 * - 'churned': Organizations whose paid subscription ended (churnedAt is set, no active subscription)
 */
export type PortalOrganizationStatusFilter = 'all' | 'trialing' | 'active' | 'cancelling' | 'churned'

/**
 * User details for portal view
 */
export interface PortalUserView {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
  banned: boolean
  banReason: string | null
  organizationCount: number
  /** First organization slug for impersonation redirect */
  firstOrganizationSlug: string | null
  createdAt: Date
}
