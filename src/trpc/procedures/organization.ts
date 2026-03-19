/**
 * Organization Procedures
 *
 * Building blocks for organization-scoped operations
 * Checks onboarding, membership, roles, and permissions
 *
 * PERFORMANCE: Uses cached ctx.getUserOrganizations() for permission checks
 * - Zero database calls for permission validation
 * - Shares cached data across all procedures in same request
 *
 * AUTHENTICATION MODES:
 * - SESSION: Normal web requests - validates membership from DB
 * - IST: Internal service tokens - uses pre-validated permissions from token
 *
 * B2B MODEL: Platform → Organizations
 */

import { TRPCError } from '@trpc/server'
import { protectedProcedure } from './auth'
import { getUserMemberships } from '@/services/membership.service'
import { createStructuredError } from '../init'
import { ERROR_CODES } from '@/lib/errors'
import type { Permission } from '@/lib/better-auth/permissions'
import type { FeatureKey } from '@/lib/config/feature-gates'
import { checkFeatureGate } from '@/services/feature-gate.service'

type OrganizationOptions = {
  /** Require specific roles (e.g., ['owner', 'admin']) */
  requireRole?: string[]
  /**
   * Require specific permission (e.g., 'billing:read', 'member:create')
   *
   * Available permissions:
   * - billing:read, billing:create, billing:update, billing:delete
   * - member:read, member:create, member:update, member:delete
   * - invitation:create, invitation:cancel
   * - organization-settings:read, organization-settings:update
   * - analytics:read
   * - integrations:read, integrations:update
   *
   * See src/lib/better-auth/permissions.ts for full list
   */
  requirePermission?: Permission
  /**
   * Enforce a limit-type feature gate at the procedure level, BEFORE the handler runs.
   *
   * Pass this option to check if the organization has available quota for the feature.
   * If the org is at their plan limit, the request is rejected with an upgrade error
   * before the handler executes. Uses a default increment of 1.
   *
   * USAGE PATTERN (create mutations):
   * 1. Set `requireFeature` here to enforce the limit check before the handler
   * 2. Inside the handler, call `incrementUsageAndInvalidate()` after successful creation
   * 3. In the corresponding delete handler, call `decrementUsageAndInvalidate()`
   *
   * USE HANDLER-LEVEL `withFeatureGate()` INSTEAD when:
   * - The increment amount is variable (e.g., storage_kb uses file size, not 1)
   * - The check is conditional (e.g., only when a specific field is non-null)
   * - Multiple feature keys need checking (e.g., templates install across categories)
   * - Usage count must be reconciled with DB before checking (e.g., syncUsageCount)
   *
   * Available feature gates (LIMIT type):
   * - 'websites.limit', 'pages_per_website.limit', 'forms.limit'
   * - 'products.limit', 'leads.limit', 'cms_tables.limit'
   * - 'storage_kb.limit', 'chat_widgets.limit'
   * - 'pipelines.limit', 'tickets.limit', 'team_seats.limit'
   * - 'email_templates.limit', 'email_domains.limit'
   * - 'automations.limit', 'contracts.limit'
   * - 'invoices.limit', 'stores.limit', 'calendars.limit'
   * - 'local_components.limit'
   *
   * See src/lib/config/feature-gates.ts for the full list and definitions.
   */
  requireFeature?: FeatureKey
  /**
   * Require Stripe Connect account to be connected
   *
   * Use this for any procedure that requires Stripe integration:
   * - Creating/updating products
   * - Creating/updating prices
   * - Creating payment links
   *
   * Throws STRIPE_NOT_CONNECTED error if organization hasn't connected Stripe.
   */
  requireStripeConnect?: boolean
}

/**
 * Organization Procedure
 *
 * Requires: Auth + Onboarding complete + Organization membership
 * Optional: Role check + Permission check (via cached context - NO DB CALLS!)
 * Context: Adds { organization, memberRole, currentPlan } to ctx
 *
 * AUTOMATIC ONBOARDING CHECK:
 * - Queries DB ONCE per request to get user's memberships
 * - Caches result in context for subsequent calls
 * - Throws ONBOARDING_INCOMPLETE if user has no organizations
 * - Works for ALL scenarios: sign-in, webhooks, AI agents, expired sessions
 *
 * PERFORMANCE OPTIMIZATION:
 * - Permission checks use ctx.getUserOrganizations() (cached, zero DB calls)
 * - Eliminates hasPermission() service calls to database
 * - Shares cached permissions across all procedures in same request
 *
 * @example
 * ```ts
 * // Simple membership check
 * getOrg: organizationProcedure()
 *   .input(z.object({ organizationId: z.string() }))
 *   .query(({ ctx }) => ctx.organization)
 *
 * // With permission check (uses cache, no DB call)
 * getMembers: organizationProcedure({ requirePermission: 'member:read' })
 *   .input(z.object({ organizationId: z.string() }))
 *   .query(({ ctx }) => { ... })
 * ```
 */
export function organizationProcedure(options?: OrganizationOptions) {
  return protectedProcedure.use(async (opts) => {
    const { ctx, next } = opts

    // CRITICAL: In tRPC v11+, input is async - must call getRawInput()
    // This returns the raw input BEFORE Zod validation
    let rawInput: unknown
    try {
      rawInput = await opts.getRawInput()
    } catch {
      rawInput = {}
    }

    // 1. Extract organizationId from input
    // Handle both direct input and nested { json: { organizationId } } formats
    let organizationId: string | undefined

    if (rawInput && typeof rawInput === 'object') {
      const input = rawInput as Record<string, unknown>
      const rawOrgId = input.organizationId

      // SECURITY: Explicit type validation to prevent type coercion attacks
      // Ensures organizationId is actually a string, not an object with toString()
      if (typeof rawOrgId === 'string' && rawOrgId.length > 0) {
        organizationId = rawOrgId
      }

      // Handle nested json wrapper (from some tRPC clients)
      if (!organizationId && input.json && typeof input.json === 'object') {
        const nestedOrgId = (input.json as Record<string, unknown>).organizationId
        // SECURITY: Same type validation for nested format
        if (typeof nestedOrgId === 'string' && nestedOrgId.length > 0) {
          organizationId = nestedOrgId
        }
      }
    }

    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required',
      })
    }

    // ========================================================================
    // IST MODE: Use pre-validated permissions from token
    // ========================================================================
    if (ctx.authSource === 'internal-token' && ctx.istPayload) {
      // Validate token is scoped to the requested organization
      if (ctx.istPayload.organizationId !== organizationId) {
        throw createStructuredError(
          'FORBIDDEN',
          'Token is not authorized for this organization',
          {
            errorCode: ERROR_CODES.NOT_ORGANIZATION_MEMBER,
            organizationId,
            message: 'Internal service token is scoped to a different organization',
          }
        )
      }

      // Get organization details from cached context
      const organizations = await ctx.getUserOrganizations()
      const org = organizations.find((o) => o.id === organizationId)

      if (!org) {
        throw createStructuredError(
          'FORBIDDEN',
          'Organization not found',
          {
            errorCode: ERROR_CODES.NOT_ORGANIZATION_MEMBER,
            organizationId,
            message: 'Organization does not exist or is not accessible',
          }
        )
      }

      // Role check for IST
      if (options?.requireRole && !options.requireRole.includes(ctx.istPayload.role)) {
        throw createStructuredError(
          'FORBIDDEN',
          'Token does not have required role',
          {
            errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            required: options.requireRole,
            current: ctx.istPayload.role,
            message: `Token role ${ctx.istPayload.role} does not have required permissions`,
          }
        )
      }

      // Permission check for IST (owners have all permissions)
      if (options?.requirePermission) {
        const hasAccess =
          ctx.istPayload.role === 'owner' ||
          ctx.istPayload.permissions.includes(options.requirePermission)

        if (!hasAccess) {
          const [resource, action] = options.requirePermission.split(':')
          throw createStructuredError(
            'FORBIDDEN',
            `Token doesn't have permission to ${action} ${resource}`,
            {
              errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
              required: [options.requirePermission],
              current: ctx.istPayload.role,
              message: `Missing required permission: ${options.requirePermission}`,
            }
          )
        }
      }

      // Feature gate check for IST (same as session mode)
      if (options?.requireFeature) {
        const gateResult = await checkFeatureGate(
          organizationId,
          options.requireFeature,
          1
        )

        if (!gateResult.allowed) {
          throw createStructuredError(
            'FORBIDDEN',
            gateResult.reason || 'Feature limit exceeded',
            {
              errorCode: ERROR_CODES.USAGE_LIMIT_REACHED,
              resource: options.requireFeature,
              limit: gateResult.limit ?? 0,
              current: gateResult.currentUsage ?? 0,
              upgradeRequired: true,
              message: gateResult.reason || 'You have reached your plan limit for this feature',
            }
          )
        }
      }

      // Stripe Connect check for IST (same as session mode)
      if (options?.requireStripeConnect) {
        const { hasStripeConnected } = await import('@/services/organization.service')
        const isConnected = await hasStripeConnected(organizationId)

        if (!isConnected) {
          throw createStructuredError(
            'PRECONDITION_FAILED',
            'Stripe account not connected. Please connect your Stripe account in Settings > Integrations.',
            {
              errorCode: ERROR_CODES.STRIPE_NOT_CONNECTED,
              organizationId,
              message: 'Connect your Stripe account to create products, prices, and payment links.',
            }
          )
        }
      }

      // Return context with IST-sourced organization info
      return next({
        ctx: {
          ...ctx,
          organization: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            customDomain: org.customDomain,
          },
          memberRole: ctx.istPayload.role,
        },
      })
    }

    // ========================================================================
    // SESSION MODE: Normal web request with cookie-based auth
    // ========================================================================

    // 0. ONBOARDING CHECK - Query DB for user's memberships
    // This is cached in context so multiple endpoints in one request don't re-query
    type ContextWithCache = typeof ctx & { _userMemberships?: Awaited<ReturnType<typeof getUserMemberships>> }
    const ctxWithCache = ctx as ContextWithCache

    const memberships = ctxWithCache._userMemberships ?? await getUserMemberships(ctx.user.id)

    // Cache for subsequent calls in this request
    if (!ctxWithCache._userMemberships) {
      ctxWithCache._userMemberships = memberships
    }

    // Check if user has ANY organization (onboarding check)
    if (!memberships.length) {
      throw createStructuredError(
        'PRECONDITION_FAILED',
        'Please complete onboarding to access this feature',
        {
          errorCode: ERROR_CODES.ONBOARDING_INCOMPLETE,
          requiredStep: 'onboarding',
          message: 'You need to create an organization first',
        }
      )
    }

    // 2. Check membership for SPECIFIC organization
    // Use cached memberships instead of querying again
    const member = memberships.find((m) => m.organizationId === organizationId)

    if (!member) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have access to this organization',
        {
          errorCode: ERROR_CODES.NOT_ORGANIZATION_MEMBER,
          organizationId: organizationId,
          message: 'User is not a member of the requested organization',
        }
      )
    }

    // 3. Check role if specified
    if (options?.requireRole && !options.requireRole.includes(member.role)) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have permission to perform this action',
        {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: options.requireRole,
          current: member.role,
          message: `User role ${member.role} does not have required permissions`,
        }
      )
    }

    // 4. Check permission if specified
    // Uses CACHED permissions from ctx.getUserOrganizations() - no DB calls!
    if (options?.requirePermission) {
      // Parse permission string: "resource:action"
      const [resource, action] = options.requirePermission.split(':')

      if (!resource || !action) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Invalid permission format: ${options.requirePermission}. Expected format: "resource:action"`,
        })
      }

      // ✅ Use cached organizations from context (NO DB CALL)
      const organizations = await ctx.getUserOrganizations()
      const org = organizations.find((o) => o.id === organizationId)

      // Owners have full access
      const hasAccess =
        org?.role === 'owner' ||
        org?.permissions.includes(options.requirePermission)

      if (!hasAccess) {
        throw createStructuredError(
          'FORBIDDEN',
          `You don't have permission to ${action} ${resource}`,
          {
            errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            required: [options.requirePermission],
            current: member.role,
            message: `Missing required permission: ${options.requirePermission}`,
          }
        )
      }
    }

    // 5. Check feature gate if specified
    // This runs BEFORE the handler executes - prevents action if limit exceeded
    if (options?.requireFeature) {
      const gateResult = await checkFeatureGate(
        organizationId,
        options.requireFeature,
        1 // Default increment of 1
      )

      if (!gateResult.allowed) {
        throw createStructuredError(
          'FORBIDDEN',
          gateResult.reason || 'Feature limit exceeded',
          {
            errorCode: ERROR_CODES.USAGE_LIMIT_REACHED,
            resource: options.requireFeature,
            limit: gateResult.limit ?? 0,
            current: gateResult.currentUsage ?? 0,
            upgradeRequired: true,
            message: gateResult.reason || 'You have reached your plan limit for this feature',
          }
        )
      }
    }

    // 6. Check Stripe Connect if required
    if (options?.requireStripeConnect) {
      const { hasStripeConnected } = await import('@/services/organization.service')
      const isConnected = await hasStripeConnected(organizationId)

      if (!isConnected) {
        throw createStructuredError(
          'PRECONDITION_FAILED',
          'Stripe account not connected. Please connect your Stripe account in Settings > Integrations.',
          {
            errorCode: ERROR_CODES.STRIPE_NOT_CONNECTED,
            organizationId,
            message: 'Connect your Stripe account to create products, prices, and payment links.',
          }
        )
      }
    }

    // 7. Return enriched context
    return next({
      ctx: {
        ...ctx,
        organization: member.organization,
        memberRole: member.role,
      },
    })
  })
}
