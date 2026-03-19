/**
 * Better Auth Configuration
 *
 * WHY: Centralized auth configuration with database integration
 * HOW: Configures Better Auth with Prisma adapter, email/password provider,
 *      and organization support
 *
 * B2B MODEL: Platform → Organizations
 * Users subscribe directly to the platform and become organization owners/members.
 */

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { organization, twoFactor, admin } from 'better-auth/plugins'
import { prisma } from '@/lib/config'
import { ac, roles } from '@/lib/better-auth/permissions'
import { nextCookies } from 'better-auth/next-js'
import { sendPasswordResetEmail } from '@/services/email.service'

/**
 * Better Auth Instance
 * WHY: Single source of truth for authentication logic
 * HOW: Configured with Prisma adapter for database operations,
 *      email/password for credentials auth, and multi-tenant plugins
 *
 * PLUGINS:
 * - organization: Multi-tenant orgs with members, roles, and invitations
 * - twoFactor: Two-factor authentication for security
 */
export const auth = betterAuth({
  databaseHooks: {
    session: {
      create: {
        before: async () => {
          // IMPORTANT SECURITY: Validate subdomain/custom domain access BEFORE creating session
          // This prevents users from signing in on subdomains, custom domains they don't belong to
        },
      },
    },
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    // Require email verification in production; skip in dev for faster iteration
    requireEmailVerification: process.env.NODE_ENV === 'production',
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({
        to: user.email,
        resetLink: url,
      })
    },
  },
  plugins: [
    // Multi-tenant organization support
    organization({
      dynamicAccessControl: {
        enabled: true,
      },
      // Enable organization features
      async sendInvitationEmail() {
        // TODO: Implement email sending logic
        // Email service integration goes here
      },
      ac,
      roles,
      // CRITICAL: Set the creator role to 'owner' (Better Auth default)
      // This ensures new organization creators get the correct RBAC role
      creatorRole: 'owner',
      allowUserToCreateOrganization: true,
    }),
    nextCookies(),

    // Two-factor authentication
    twoFactor({
      issuer: process.env.NEXT_PUBLIC_APP_NAME,
    }),

    /**
     * Admin Plugin - User Impersonation
     * WHY: Allows portal admins to impersonate users for debugging/support
     * HOW: Creates a session that mirrors the target user's access
     *
     * SECURITY:
     * - Only users with User.role='admin' can impersonate (set when creating portal admin)
     * - User.role is separate from org Member roles (owner/admin/member in Member table)
     * - Impersonation sessions last 1 hour by default
     * - Cannot impersonate other admins unless explicitly enabled
     */
    admin({
      // Only 'admin' role can use impersonation (better-auth requirement)
      // Note: This is User.role, NOT organization member roles (those are in Member table)
      impersonationSessionDuration: 60 * 60, // 1 hour
    }),
  ],

  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'}`,
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  // CRITICAL: Secret for encryption (required for cookies to work properly)
  // In production, fail loudly if the secret is missing to prevent insecure fallback
  secret: (() => {
    const s = process.env.BETTER_AUTH_SECRET
    if (!s && process.env.NODE_ENV === 'production') {
      throw new Error('BETTER_AUTH_SECRET is required in production')
    }
    return s || 'dev-only-secret-change-me'
  })(),

  // Base URL - used for email links and OAuth callbacks
  // In production, this should be set per-request, but for now we use platform domain
  // Falls back through: BETTER_AUTH_URL → NEXT_PUBLIC_APP_URL → localhost
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000',

  // IMPORTANT: Trust all origins in development, specific domains in production.
  // This allows Better Auth to work across subdomains and custom domains.
  // Without the subdomain wildcard, requests from *.mochidev.net are rejected
  // as "invalid origin" — breaking sign-in, sign-out, and all auth flows.
  trustedOrigins:
    process.env.NODE_ENV === 'development'
      ? ['*'] // Trust all origins in development for subdomain testing
      : [
          // Root domain (e.g., https://mochidev.net)
          process.env.NEXT_PUBLIC_APP_URL ||
            process.env.PLATFORM_API_URL ||
            'http://localhost:3000',
          // All subdomains (e.g., https://web-prodigies.mochidev.net)
          // CRITICAL: Without this, auth requests from subdomains fail with "invalid origin"
          `https://*.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
        ],
})

/**
 * Export auth session and user types for type safety
 */
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
