/**
 * Website Domains Router
 *
 * tRPC router for website domain management operations ONLY.
 * For email domain operations, see email-domains.ts router.
 *
 * DOMAIN-WEBSITE ROUTING ARCHITECTURE:
 * ====================================
 *
 * Preview URL: /{website.previewId}/{website.slug} (uses auto-generated previewId)
 * Production URL: {domain.customDomain}/{website.slug} (uses actual domain)
 *
 * Architecture:
 * - One domain → multiple websites (pages)
 * - Domain is the actual custom domain (e.g., "webprodigies.com")
 * - Website defines the specific page path (e.g., "home", "checkout", "pricing")
 * - Each website has its own canvasData (pages/elements)
 * - Domains are GLOBALLY unique (only one org can own a domain)
 *
 * PERMISSIONS:
 * - DOMAINS_READ: List and view domains
 * - DOMAINS_CREATE: Create new domains
 * - DOMAINS_UPDATE: Edit domain details
 * - DOMAINS_DELETE: Delete domains
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
import { withBooleanFeature } from '@/trpc/procedures/feature-gates'
import {
  generateDnsInstructions,
  verifyCustomDomainDns,
} from '@/services/dns-verification.service'
import {
  listDomains,
  getDomainWithCount,
  isDomainAvailable,
  getDomainForDnsInstructions,
  verifyAndUpdateDomainDns,
  getDomainPages,
  setDomainDefaultPage,
  createDomain,
  updateDomain,
  deleteDomain,
} from '@/services/domain.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing domains with pagination and search
 */
export const listDomainsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
})

/**
 * Schema for getting a single domain by ID
 */
export const getDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for creating a new domain
 *
 * VALIDATION RULES:
 * - customDomain: Required, must be a valid domain WITHOUT protocol (e.g., "webprodigies.com")
 * - REJECTS: https://, http://, www. prefixes - user must enter plain domain only
 */
export const createDomainSchema = z.object({
  organizationId: z.string(),
  customDomain: z
    .string()
    .min(1, 'Domain is required')
    .max(253, 'Domain is too long')
    .refine(
      (val) => !val.includes('://'),
      'Do not include http:// or https:// - just enter the domain (e.g., webprodigies.com)'
    )
    .refine(
      (val) => !val.startsWith('www.'),
      'Do not include www. - just enter the domain (e.g., webprodigies.com)'
    )
    .refine(
      (val) => {
        // Validate plain domain format: alphanumeric, dots, hyphens, must have TLD
        return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(val)
      },
      'Please enter a valid domain (e.g., webprodigies.com)'
    ),
})

/**
 * Schema for updating a domain
 *
 * VALIDATION: Same as create - no protocol, no www., plain domain only
 */
export const updateDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
  customDomain: z
    .string()
    .min(1)
    .max(253)
    .refine(
      (val) => !val.includes('://'),
      'Do not include http:// or https:// - just enter the domain'
    )
    .refine(
      (val) => !val.startsWith('www.'),
      'Do not include www. - just enter the domain'
    )
    .refine(
      (val) => {
        return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(val)
      },
      'Please enter a valid domain'
    )
    .optional(),
})

/**
 * Schema for deleting a domain
 */
export const deleteDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for checking domain availability (GLOBAL)
 *
 * WHY: Domains must be GLOBALLY unique across all organizations
 * HOW: Checks uniqueness across entire platform
 */
export const checkDomainAvailabilitySchema = z.object({
  customDomain: z.string().min(1),
  excludeDomainId: z.string().optional(),
})

/**
 * Schema for getting DNS instructions for a domain
 *
 * WHY: Users need to know what DNS records to add to their domain provider
 * HOW: Returns DNS records based on the domain configuration
 */
export const getDnsInstructionsSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for verifying domain DNS configuration
 *
 * WHY: Confirms that users have correctly configured their DNS
 * HOW: Performs DNS lookups to check record configuration
 */
export const verifyDomainSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for getting pages available for a domain
 *
 * WHY: Needed for default page dropdown - shows all published pages under this domain
 * HOW: Returns pages from all websites under this domain
 */
export const getDomainPagesSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
})

/**
 * Schema for setting domain's default page
 *
 * WHY: When users visit the root of a domain, they should be redirected to a specific page
 * HOW: Sets defaultPageId on the domain (null to clear)
 */
export const setDefaultPageSchema = z.object({
  organizationId: z.string(),
  domainId: z.string(),
  defaultPageId: z.string().nullable(), // null to clear the default page
})

// ============================================================================
// ROUTER
// ============================================================================

export const domainsRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List all domains for organization with pagination
   *
   * WHY: Main endpoint for domains list page with search support
   * HOW: Returns paginated results with website counts
   */
  list: organizationProcedure({ requirePermission: permissions.DOMAINS_READ })
    .input(listDomainsSchema)
    .query(async ({ input }) => {
      return await listDomains({
        organizationId: input.organizationId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get a single domain by ID
   *
   * WHY: Retrieve full domain details for editing/viewing
   * HOW: Returns domain with website count
   */
  getById: organizationProcedure({ requirePermission: permissions.DOMAINS_READ })
    .input(getDomainSchema)
    .query(async ({ input }) => {
      const domain = await getDomainWithCount(input.organizationId, input.domainId)

      if (!domain) {
        throw createStructuredError('NOT_FOUND', 'Domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Domain not found',
        })
      }

      return domain
    }),

  /**
   * Check if a domain is available GLOBALLY
   *
   * WHY: Domains must be GLOBALLY unique across all organizations
   * HOW: Checks for existing domain across entire platform (case-insensitive)
   *
   * NOTE: Also checks for variants with/without protocol prefix since
   * some old data might have been stored with https:// prefix.
   */
  checkAvailability: baseProcedure
    .input(checkDomainAvailabilitySchema)
    .query(async ({ input }) => {
      const available = await isDomainAvailable(input.customDomain, input.excludeDomainId)
      return { available }
    }),

  // ==========================================================================
  // DNS VERIFICATION OPERATIONS
  // ==========================================================================

  /**
   * Get DNS instructions for setting up a domain
   *
   * WHY: Users need clear instructions on what DNS records to add
   * HOW: Generates DNS records and performs LIVE DNS check for status
   *
   * RETURNS:
   * - DNS records to add (CNAME, TXT)
   * - Step-by-step instructions
   * - Current verification status (LIVE from DNS lookup)
   */
  getDnsInstructions: organizationProcedure({
    requirePermission: permissions.DOMAINS_READ,
  })
    .input(getDnsInstructionsSchema)
    .query(async ({ input }) => {
      const domain = await getDomainForDnsInstructions(input.organizationId, input.domainId)

      if (!domain) {
        throw createStructuredError('NOT_FOUND', 'Domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Domain not found',
        })
      }

      // Generate base DNS instructions
      const instructions = generateDnsInstructions(domain.customDomain, domain.id)

      // Perform LIVE DNS verification to get actual record status
      // WHY: Users need to see real-time status of their DNS records
      // HOW: Calls verifyCustomDomainDns which does actual DNS lookups
      const liveStatus = await verifyCustomDomainDns(domain.customDomain, domain.id)

      // Merge live status into the instructions
      // Map the live verification results back to the instruction records
      const recordsWithLiveStatus = instructions.records.map((record) => {
        const liveRecord = liveStatus.records.find((r) => r.type === record.type)
        return {
          ...record,
          status: liveRecord?.status || record.status,
          description: liveRecord?.description || record.description,
        }
      })

      return {
        ...instructions,
        records: recordsWithLiveStatus,
        isVerified: domain.isVerified,
        customDomain: domain.customDomain,
        verificationMessage: liveStatus.message,
      }
    }),

  /**
   * Verify domain DNS configuration
   *
   * WHY: Confirms that users have correctly set up their DNS
   * HOW: Performs DNS lookups to check A, CNAME, and TXT records
   *
   * PROCESS:
   * 1. Performs DNS lookups for the domain
   * 2. Checks if domain points to our platform (A or CNAME)
   * 3. Optionally checks TXT record for ownership verification
   * 4. Updates isVerified status in database if successful
   */
  verifyDomain: organizationProcedure({
    requirePermission: permissions.DOMAINS_UPDATE,
  })
    .input(verifyDomainSchema)
    .mutation(async ({ input }) => {
      const result = await verifyAndUpdateDomainDns(
        input.organizationId,
        input.domainId,
        verifyCustomDomainDns
      )

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Domain not found',
        })
      }

      return result
    }),

  /**
   * Get all published pages for a domain
   *
   * WHY: Populates the default page dropdown in domain settings
   * HOW: Returns all PUBLISHED pages from websites under this domain
   *
   * RETURNS:
   * - pages: Array of {id, name, slug, websiteName} for dropdown
   * - hasPages: Boolean to indicate if there are any pages
   * - hasWebsites: Boolean to indicate if there are any websites
   */
  getPages: organizationProcedure({ requirePermission: permissions.DOMAINS_READ })
    .input(getDomainPagesSchema)
    .query(async ({ input }) => {
      const result = await getDomainPages(input.organizationId, input.domainId)

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Domain not found',
        })
      }

      return result
    }),

  /**
   * Set the default page for a domain
   *
   * WHY: When visitors access the root of a domain, redirect to this page
   * HOW: Updates defaultPageId on the domain record
   *
   * VALIDATION:
   * - Page must exist and be PUBLISHED
   * - Page must belong to this domain
   * - Pass null to clear the default page
   */
  setDefaultPage: organizationProcedure({
    requirePermission: permissions.DOMAINS_UPDATE,
  })
    .input(setDefaultPageSchema)
    .mutation(async ({ input }) => {
      const result = await setDomainDefaultPage(
        input.organizationId,
        input.domainId,
        input.defaultPageId
      )

      if (!result.found) {
        throw createStructuredError('NOT_FOUND', 'Domain not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Domain not found',
        })
      }

      if ('pageNotFound' in result && result.pageNotFound) {
        throw createStructuredError(
          'BAD_REQUEST',
          'Page not found, not published, or does not belong to this domain',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              'Please select a published page that belongs to this domain',
          }
        )
      }

      return { success: result.success, message: result.message }
    }),

  // ==========================================================================
  // CREATE OPERATIONS
  // ==========================================================================

  /**
   * Create a new domain
   *
   * WHY: Register a custom domain to host multiple websites
   * HOW: Creates domain record after GLOBAL uniqueness checks
   *
   * VALIDATION:
   * - Domain must be GLOBALLY unique across all organizations
   */
  create: organizationProcedure({ requirePermission: permissions.DOMAINS_CREATE })
    .input(createDomainSchema)
    .mutation(async ({ ctx, input }) => {
      /* Gate: custom_domain boolean feature — free tier users cannot connect custom domains */
      await withBooleanFeature(
        ctx,
        input.organizationId,
        'custom_domain',
        'Custom domains are not available on your current plan. Please upgrade to connect your own domain.'
      )

      try {
        return await createDomain({
          organizationId: input.organizationId,
          customDomain: input.customDomain,
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'Domain is already in use') {
          throw createStructuredError(
            'BAD_REQUEST',
            'Domain is already in use',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'This domain is already registered',
            }
          )
        }
        throw error
      }
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update domain settings
   *
   * WHY: Change the domain to a different one
   * HOW: Partial update with GLOBAL uniqueness checks
   */
  update: organizationProcedure({ requirePermission: permissions.DOMAINS_UPDATE })
    .input(updateDomainSchema)
    .mutation(async ({ input }) => {
      const { organizationId, domainId, customDomain } = input

      // If no changes to make, just return the current domain
      if (!customDomain) {
        return await getDomainForDnsInstructions(organizationId, domainId)
      }

      try {
        return await updateDomain(organizationId, domainId, { customDomain })
      } catch (error) {
        if (error instanceof Error && error.message === 'Domain is already in use') {
          throw createStructuredError(
            'BAD_REQUEST',
            'Domain is already in use',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'This domain is already registered',
            }
          )
        }
        throw error
      }
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Delete a domain (hard delete)
   *
   * WHY: Permanently removes domain from the database
   * HOW: Uses Prisma delete to remove the record
   *
   * NOTE: Websites under this domain will have their domainId set to null (orphaned)
   * and users can reassign them to a different domain or continue editing them via previewId URL.
   */
  delete: organizationProcedure({ requirePermission: permissions.DOMAINS_DELETE })
    .input(deleteDomainSchema)
    .mutation(async ({ input }) => {
      await deleteDomain(input.organizationId, input.domainId)

      return { success: true, message: 'Domain deleted. Websites under this domain are still accessible.' }
    }),

})
