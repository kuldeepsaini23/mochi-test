/**
 * tRPC Core Setup
 *
 * Everything you need to build tRPC endpoints:
 * - Context (shared data)
 * - Error helpers
 * - Procedures (auth guards)
 * - Router builder
 *
 * AUTHENTICATION MODES:
 * 1. Cookie-based session (normal web requests)
 * 2. Internal Service Token (IST) for Trigger tasks, automation, etc.
 *
 * Both modes use the SAME procedures - no duplication needed.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { TRPCError } from '@trpc/server'
import { prisma } from '@/lib/config'
import { auth } from '@/lib/better-auth/auth'
import type { StructuredErrorCause } from '@/lib/errors'
import {
  validateInternalServiceToken,
  getISTHeaderName,
  type ISTPayload,
} from '@/lib/internal-service-token'
import { getSubdomain, getCustomDomain } from '@/lib/utils/domain'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Authentication source - how the user was authenticated
 */
export type AuthSource = 'session' | 'internal-token'

/**
 * Extended user type that includes IST metadata when authenticated via token
 */
export interface ContextUser {
  id: string
  name: string | null
  email: string
  image?: string | null
  emailVerified?: boolean
  /** Authentication source */
  authSource?: AuthSource
  /** IST metadata (only present when authenticated via token) */
  istPayload?: ISTPayload
}

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Context Factory
 *
 * Shared resources (DB, auth session, user organizations) available to all procedures
 * Cached per request - organizations fetched once and reused across all procedures
 *
 * AUTHENTICATION:
 * - First checks for Internal Service Token (IST) in headers
 * - Falls back to cookie-based session authentication
 * - Both methods populate ctx.user identically for downstream procedures
 *
 * PERFORMANCE: User organizations are fetched lazily and cached via getUserOrganizationsLazy()
 *              This ensures we don't fetch organizations for unauthenticated requests or
 *              procedures that don't need them.
 */
export const createTRPCContext = cache(async () => {
  const requestHeaders = await headers()

  // ============================================================================
  // AUTHENTICATION: Check IST first, then fall back to session
  // ============================================================================

  // Session/auth state — resolved lazily to avoid calling cookies() on public routes.
  // WHY: auth.api.getSession() triggers Better Auth's nextCookies() plugin which calls
  // cookies().set() for session refresh. This crashes pages that Next.js considers static
  // (e.g., public website pages using baseProcedure). By deferring session resolution,
  // only protected procedures that actually need the user trigger the cookies() call.
  let user: ContextUser | null = null
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null
  let istPayload: ISTPayload | undefined = undefined
  let authSource: AuthSource | undefined = undefined
  let authResolved = false

  /**
   * Lazily resolve authentication — only called when a procedure needs the user.
   * Public routes (baseProcedure) skip this entirely, avoiding the cookies() crash.
   */
  const resolveAuth = cache(async () => {
    if (authResolved) return

    // 1. Check for Internal Service Token (IST)
    const istHeader = requestHeaders.get(getISTHeaderName())

    if (istHeader) {
      const validation = validateInternalServiceToken(istHeader)

      if (validation.valid && validation.payload) {
        istPayload = validation.payload

        // For user-initiated actions (actorType === 'user'), fetch the actual user
        // For system actions, create a synthetic user object
        if (validation.payload.actorType === 'user') {
          // Fetch real user data for audit trail
          const dbUser = await prisma.user.findUnique({
            where: { id: validation.payload.actorId },
            select: { id: true, name: true, email: true, image: true, emailVerified: true },
          })

          if (dbUser) {
            user = {
              ...dbUser,
              authSource: 'internal-token',
              istPayload: validation.payload,
            }
            authSource = 'internal-token'
          }
        } else {
          // System/automation actor - create synthetic user for context
          user = {
            id: validation.payload.actorId,
            name: `System: ${validation.payload.source ?? 'internal'}`,
            email: `${validation.payload.actorId}@internal.mochi`,
            authSource: 'internal-token',
            istPayload: validation.payload,
          }
          authSource = 'internal-token'
        }
      }
    }

    // 2. Fall back to cookie-based session if no valid IST
    if (!user) {
      const fullSession = await auth.api.getSession({
        headers: requestHeaders,
      })

      session = fullSession
      if (fullSession?.user) {
        user = {
          ...fullSession.user,
          authSource: 'session',
        }
        authSource = 'session'
      }
    }

    authResolved = true
  })

  /**
   * Lazy organization fetcher
   * WHY: Avoid fetching organizations for every request - only when needed
   * HOW: Call await ctx.getUserOrganizations() in procedures that need it
   *
   * IST MODE: When authenticated via IST, permissions come from the token
   * SESSION MODE: Fetch memberships from database and enrich with permissions
   */
  const getUserOrganizationsLazy = cache(async () => {
    // IST MODE: Use pre-validated permissions from token
    if (istPayload && user) {
      // Fetch the organization details for the token's org
      const org = await prisma.organization.findUnique({
        where: { id: istPayload.organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          customDomain: true,
          stripeConnectedAccountId: true,
          stripeAccountCurrency: true,
        },
      })

      if (!org) return []

      return [
        {
          id: org.id,
          name: org.name,
          slug: org.slug,
          customDomain: org.customDomain,
          stripeConnectedAccountId: org.stripeConnectedAccountId,
          stripeAccountCurrency: org.stripeAccountCurrency,
          role: istPayload.role,
          permissions: istPayload.permissions,
          createdAt: new Date(), // Token doesn't have this, use current time
        },
      ]
    }

    // SESSION MODE: Fetch from database
    if (!user?.id) return []

    const { getUserMemberships } = await import('@/services/membership.service')
    const memberships = await getUserMemberships(user.id)

    if (!memberships.length) return []

    // Enrich with permissions
    const enrichedMemberships = await Promise.all(
      memberships.map(async (m) => {
        // Owners have full permissions
        if (m.role === 'owner') {
          return {
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            customDomain: m.organization.customDomain,
            stripeConnectedAccountId: m.organization.stripeConnectedAccountId,
            stripeAccountCurrency: m.organization.stripeAccountCurrency,
            role: m.role,
            permissions: [], // Empty = full access
            createdAt: m.createdAt,
          }
        }

        // Fetch role permissions
        const organizationRole = await prisma.organizationRole.findFirst({
          where: {
            organizationId: m.organizationId,
            role: m.role,
          },
          select: { permission: true },
        })

        // Parse permissions
        let permissions: string[] = []
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
        }

        return {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          customDomain: m.organization.customDomain,
          stripeConnectedAccountId: m.organization.stripeConnectedAccountId,
          stripeAccountCurrency: m.organization.stripeAccountCurrency,
          role: m.role,
          permissions,
          createdAt: m.createdAt,
        }
      })
    )

    return enrichedMemberships
  })

  /**
   * Get Active Organization
   *
   * WHY: Determines which organization the user is currently working in
   * HOW: Domain-first approach - subdomain/custom domain takes precedence
   *
   * SECURITY CRITICAL: This function enforces multi-tenancy isolation.
   * - If on a subdomain (e.g., acme.mochi.test), ONLY that org can be active
   * - If on a custom domain (e.g., mycompany.com), ONLY that org can be active
   * - If on root domain (e.g., mochi.test), use session.activeOrganizationId
   *
   * PRIORITY (DOMAIN-FIRST):
   * 1. Subdomain slug match (HIGHEST - if on subdomain, that org IS active)
   * 2. Custom domain match (if on custom domain, that org IS active)
   * 3. session.activeOrganizationId (only on root domain)
   * 4. First owned organization (fallback)
   * 5. First organization user is a member of (final fallback)
   *
   * This prevents the security issue where a user on org-a's subdomain
   * could have org-b as active and see org-b's data.
   *
   * SOURCE OF TRUTH KEYWORDS: ActiveOrganization, OrgContext, MultiTenancy, SubdomainContext
   */
  const getActiveOrganizationLazy = cache(async () => {
    const organizations = await getUserOrganizationsLazy()
    if (!organizations.length) return null

    // ========================================================================
    // STEP 1: Check subdomain - if present, that org IS the active org
    // ========================================================================
    // SECURITY: User on acme.mochi.test MUST see acme's data, not any other org
    const currentSubdomain = await getSubdomain()
    if (currentSubdomain) {
      const subdomainOrg = organizations.find((org) => org.slug === currentSubdomain)
      if (subdomainOrg) {
        return subdomainOrg
      }
      // Subdomain exists but user doesn't have access - protected layout will catch this
      // Return null to trigger proper handling upstream
      return null
    }

    // ========================================================================
    // STEP 2: Check custom domain - if present, that org IS the active org
    // ========================================================================
    // SECURITY: User on mycompany.com MUST see that company's data
    const currentCustomDomain = await getCustomDomain()
    if (currentCustomDomain) {
      const customDomainOrg = organizations.find((org) => {
        if (!org.customDomain) return false
        // Handle both "example.com" and "https://example.com" formats
        const cleanOrgDomain = org.customDomain.replace(/^https?:\/\//, '')
        return cleanOrgDomain === currentCustomDomain
      })
      if (customDomainOrg) {
        return customDomainOrg
      }
      // Custom domain exists but user doesn't have access - protected layout will catch this
      return null
    }

    // ========================================================================
    // STEP 3: On root domain - use session.activeOrganizationId
    // ========================================================================
    // Only on the root domain (mochi.test) do we respect the session's active org
    // This is where the team switcher matters - switching sets activeOrganizationId
    const activeOrgId = (session?.session as { activeOrganizationId?: string | null })?.activeOrganizationId

    if (activeOrgId) {
      // SECURITY: Validate user is still a member of this organization
      const activeOrg = organizations.find((org) => org.id === activeOrgId)
      if (activeOrg) {
        return activeOrg
      }
      // User is no longer a member of activeOrganizationId - fall through to default
    }

    // ========================================================================
    // STEP 4: Default fallback - prefer owned org, then first org
    // ========================================================================
    return organizations.find((org) => org.role === 'owner') || organizations[0]
  })

  /**
   * Organization tier fetcher
   * WHY: Pre-load tier details for feature gate checks
   * HOW: Call await ctx.getOrganizationTier(organizationId) in procedures
   * CACHED: Per request via React cache() in feature-gate.service
   */
  const getOrganizationTierLazy = cache(async (organizationId: string) => {
    const { getOrganizationTier } = await import('@/services/feature-gate.service')
    return getOrganizationTier(organizationId)
  })

  /**
   * Usage metrics fetcher
   * WHY: Provide cached access to usage data for feature gate checks
   * HOW: Call await ctx.getAllUsageMetrics(organizationId) in procedures
   * CACHED: Per request via React cache() in feature-gate.service
   */
  const getAllUsageMetricsLazy = cache(async (organizationId: string) => {
    const { getAllUsageMetrics } = await import('@/services/feature-gate.service')
    return getAllUsageMetrics(organizationId)
  })

  return {
    prisma,
    // Auth state is lazy — call resolveAuth() before accessing these on protected routes.
    // Public routes (baseProcedure) can safely skip resolveAuth() to avoid cookies() calls.
    get session() { return session },
    get user() { return user },
    get authSource() { return authSource },
    get istPayload() { return istPayload },
    resolveAuth,
    getUserOrganizations: getUserOrganizationsLazy,
    getActiveOrganization: getActiveOrganizationLazy,
    getOrganizationTier: getOrganizationTierLazy,
    getAllUsageMetrics: getAllUsageMetricsLazy,
  }
})

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

// ============================================================================
// ERROR HELPERS
// ============================================================================

/**
 * Create Structured Error
 *
 * Creates a tRPC error with structured cause for client-side handling
 *
 * @example
 * ```ts
 * throw createStructuredError('FORBIDDEN', 'Access denied', {
 *   errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
 *   required: ['admin'],
 *   current: 'member',
 * })
 * ```
 */
export function createStructuredError(
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'PRECONDITION_FAILED' | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR',
  message: string,
  cause: StructuredErrorCause
): TRPCError {
  return new TRPCError({ code, message, cause })
}

// ============================================================================
// PROCEDURES & ROUTER (Re-exports)
// ============================================================================

export { router as createTRPCRouter } from './procedures/base'
export {
  baseProcedure,
  protectedProcedure,
  organizationProcedure,
} from './procedures'
