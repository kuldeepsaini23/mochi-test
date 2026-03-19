/**
 * Email Domains Router
 *
 * tRPC router for email domain management with Resend integration.
 * Allows organizations to send emails from their custom domains.
 *
 * EMAIL DOMAIN WORKFLOW:
 * ======================
 * 1. User adds domain via create()
 * 2. System registers with Resend, returns DNS records
 * 3. User adds DNS records to their domain provider
 * 4. User triggers verification via verify()
 * 5. Once VERIFIED, emails can be sent from that domain
 *
 * PERMISSIONS:
 * - EMAIL_READ: List and view email domains
 * - EMAIL_SEND: Create, update, delete email domains
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  withFeatureGate,
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import { syncUsageCount } from '@/services/feature-gate.service'
import { prisma } from '@/lib/config/prisma'
import {
  createEmailDomain,
  getEmailDomainById,
  listEmailDomains,
  verifyEmailDomain,
  refreshEmailDomainStatus,
  deleteEmailDomain,
  toggleEmailDomainSending,
  updateEmailDomainTracking,
  isEmailDomainNameGloballyAvailable,
} from '@/services/email-domain.service'
import { RESEND_REGIONS } from '@/lib/config/resend'

// ============================================================================
// INPUT SCHEMAS - SOURCE OF TRUTH for email domain validation
// ============================================================================

/**
 * Schema for listing email domains with pagination
 */
export const listEmailDomainsSchema = z.object({
  organizationId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
})

/**
 * Schema for getting a single email domain by ID
 */
export const getEmailDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for creating a new email domain
 *
 * VALIDATION RULES:
 * - name: Valid domain format (e.g., "example.com", "mail.example.com")
 * - region: One of the Resend data center regions
 */
export const createEmailDomainSchema = z.object({
  organizationId: z.string(),
  name: z
    .string()
    .min(1, 'Domain name is required')
    .max(253) // Max DNS label length
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i,
      'Please enter a valid domain (e.g., example.com)'
    ),
  region: z
    .enum(RESEND_REGIONS.map((r) => r.value) as [string, ...string[]])
    .default('us-east-1'),
})

/**
 * Schema for verifying email domain DNS records
 */
export const verifyEmailDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for refreshing email domain status
 */
export const refreshEmailDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for deleting an email domain
 */
export const deleteEmailDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for toggling email domain sending
 */
export const toggleEmailDomainSendingSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
  enabled: z.boolean(),
})

/**
 * Schema for updating email tracking settings
 *
 * SOURCE OF TRUTH KEYWORDS: UpdateTrackingSchema, EmailTrackingInput
 */
export const updateEmailTrackingSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
  openTracking: z.boolean(),
  clickTracking: z.boolean(),
})

/**
 * Schema for checking email domain availability (GLOBAL check)
 *
 * WHY: Email domains must be GLOBALLY unique across all organizations
 * because only one entity can own/verify a domain for email sending
 *
 * SOURCE OF TRUTH KEYWORDS: EmailDomainAvailability, CheckEmailDomain
 */
export const checkEmailDomainAvailabilitySchema = z.object({
  name: z
    .string()
    .min(1, 'Domain name is required')
    .max(253)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i,
      'Please enter a valid domain (e.g., example.com)'
    ),
  excludeDomainId: z.string().optional(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const emailDomainsRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List all email domains for organization with pagination
   *
   * WHY: Display domains in settings UI for management
   * HOW: Returns paginated results with DNS records and status
   */
  list: organizationProcedure({ requirePermission: permissions.EMAIL_READ })
    .input(listEmailDomainsSchema)
    .query(async ({ input }) => {
      try {
        return await listEmailDomains(input)
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to list email domains',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to list email domains',
          }
        )
      }
    }),

  /**
   * Check if an email domain is globally available
   *
   * WHY: Email domains must be GLOBALLY unique across all organizations
   * because only one entity can own/verify a domain for email sending.
   * This is different from website domains which are org-scoped.
   *
   * HOW: Checks across ALL organizations in the database
   *
   * USE CASE: Call this before showing the create form's submit button
   * to give users early feedback on domain availability
   */
  checkAvailability: baseProcedure
    .input(checkEmailDomainAvailabilitySchema)
    .query(async ({ input }) => {
      const available = await isEmailDomainNameGloballyAvailable(
        input.name.toLowerCase(),
        input.excludeDomainId
      )
      return { available }
    }),

  /**
   * Get a single email domain by ID
   *
   * WHY: Retrieve full domain details including DNS records for setup
   * HOW: Returns domain with all configuration and verification status
   */
  getById: organizationProcedure({ requirePermission: permissions.EMAIL_READ })
    .input(getEmailDomainSchema)
    .query(async ({ input }) => {
      const domain = await getEmailDomainById(
        input.organizationId,
        input.domainId
      )

      if (!domain) {
        throw createStructuredError('NOT_FOUND', 'Email domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Email domain not found',
        })
      }

      return domain
    }),

  // ==========================================================================
  // CREATE OPERATIONS
  // ==========================================================================

  /**
   * Create a new email domain
   *
   * WHY: Register a custom domain with Resend for email sending
   * HOW: Creates domain in Resend API, stores reference and DNS records
   *
   * FEATURE GATE: email_domains.limit
   * Checks organization's email domain limit before creating
   *
   * RETURNS: Domain with DNS records user needs to add to their provider
   */
  create: organizationProcedure({ requirePermission: permissions.EMAIL_SEND })
    .input(createEmailDomainSchema)
    .mutation(async ({ ctx, input }) => {
      /* Feature gate checked at handler level: syncUsageCount reconciliation before check.
       * Must reconcile actual DB count with UsageMetrics before checking the limit.
       * Counter can drift out of sync when domains are deleted via different code paths
       * or when partial failures occur. Counting real records ensures accuracy.
       * Procedure-level requireFeature runs the check before the handler, so it would
       * skip the reconciliation step.
       * SOURCE OF TRUTH: SyncUsageCount, EmailDomainUsageReconciliation */
      const actualEmailDomainCount = await prisma.emailDomain.count({
        where: { organizationId: input.organizationId },
      })
      await syncUsageCount(input.organizationId, 'email_domains.limit', actualEmailDomainCount)
      await withFeatureGate(ctx, input.organizationId, 'email_domains.limit')

      try {
        const domain = await createEmailDomain({
          organizationId: input.organizationId,
          name: input.name.toLowerCase(),
          region: input.region as 'us-east-1' | 'eu-west-1' | 'sa-east-1' | 'ap-northeast-1',
        })

        // Increment usage after successful creation
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'email_domains.limit')

        return domain
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create domain'

        throw createStructuredError('BAD_REQUEST', message, {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message,
        })
      }
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Verify email domain DNS records
   *
   * WHY: Trigger DNS verification after user adds records to their provider
   * HOW: Calls Resend API to check DNS records and updates local status
   *
   * RETURNS: Updated domain with new verification status
   */
  verify: organizationProcedure({ requirePermission: permissions.EMAIL_SEND })
    .input(verifyEmailDomainSchema)
    .mutation(async ({ input }) => {
      try {
        return await verifyEmailDomain(input.organizationId, input.domainId)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to verify domain'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email domain not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email domain not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to verify email domain',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Refresh email domain status from Resend
   *
   * WHY: Get latest DNS record status without triggering new verification
   * HOW: Fetches current domain state from Resend and syncs locally
   *
   * USE CASE: Polling for status updates or refreshing stale data
   */
  refresh: organizationProcedure({ requirePermission: permissions.EMAIL_READ })
    .input(refreshEmailDomainSchema)
    .mutation(async ({ input }) => {
      try {
        return await refreshEmailDomainStatus(
          input.organizationId,
          input.domainId
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to refresh status'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email domain not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email domain not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to refresh email domain status',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Toggle sending enabled for email domain
   *
   * WHY: Allow org admins to disable sending from a domain temporarily
   * HOW: Updates sendingEnabled flag without affecting Resend status
   */
  toggleSending: organizationProcedure({
    requirePermission: permissions.EMAIL_SEND,
  })
    .input(toggleEmailDomainSendingSchema)
    .mutation(async ({ input }) => {
      try {
        return await toggleEmailDomainSending(
          input.organizationId,
          input.domainId,
          input.enabled
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to toggle sending'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email domain not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email domain not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to toggle email domain sending',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Update email tracking settings
   *
   * WHY: Allow users to enable/disable open and click tracking per domain
   * HOW: Updates both Resend API and local database
   *
   * TRACKING OPTIONS:
   * - openTracking: Track when recipients open emails (via invisible pixel)
   * - clickTracking: Track when recipients click links (via redirect)
   *
   * PRIVACY NOTE: Both are disabled by default for better deliverability
   * and privacy. Resend recommends disabling for transactional emails.
   */
  updateTracking: organizationProcedure({
    requirePermission: permissions.EMAIL_SEND,
  })
    .input(updateEmailTrackingSchema)
    .mutation(async ({ input }) => {
      try {
        return await updateEmailDomainTracking(
          input.organizationId,
          input.domainId,
          input.openTracking,
          input.clickTracking
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update tracking'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email domain not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email domain not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to update email tracking settings',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Delete an email domain
   *
   * WHY: Remove domain from both Resend and local database
   * HOW: Deletes from Resend API first, then removes local record
   *
   * FEATURE GATE: email_domains.limit
   * Decrements usage after successful deletion to free up quota
   *
   * IMPORTANT: This is a HARD delete. Emails can no longer be sent from
   * this domain after deletion.
   */
  delete: organizationProcedure({ requirePermission: permissions.EMAIL_SEND })
    .input(deleteEmailDomainSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteEmailDomain(input.organizationId, input.domainId)

        // Decrement usage after successful deletion
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'email_domains.limit')

        return { success: true, message: 'Email domain deleted successfully' }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete domain'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Email domain not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Email domain not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to delete email domain',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),
})
