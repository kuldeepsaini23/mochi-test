/**
 * DOMAIN SERVICE (DAL)
 *
 * Data Access Layer for domain operations.
 * This is the ONLY place that should interact with Prisma for domains.
 *
 * DOMAIN-WEBSITE ARCHITECTURE:
 * ============================
 *
 * A Domain represents a custom domain that hosts multiple websites:
 * - customDomain: "webprodigies.com" (the actual domain, required)
 * - One organization can have multiple domains
 * - Each domain can contain multiple websites
 * - A domain is GLOBALLY unique (only one org can own it)
 *
 * URL PATTERNS:
 * - Preview: /{website.previewId}/{website.slug} (uses auto-generated previewId)
 * - Production: {domain.customDomain}/{website.slug} (uses actual domain)
 *
 * WHY DOMAINS?
 * - Enables custom domain branding per domain (not per website)
 * - Supports multi-site architecture (multiple websites under one domain)
 * - Domain is globally unique to prevent conflicts across organizations
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'
import type { DnsVerificationResult } from './dns-verification.service'

// ============================================================================
// TYPES
// ============================================================================

export type DomainCreateInput = {
  organizationId: string
  customDomain: string
  /** Optional userId for activity logging */
  userId?: string
}

export type DomainUpdateInput = {
  customDomain?: string
}

export type ListDomainsInput = {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
}

// ============================================================================
// DOMAIN CRUD OPERATIONS
// ============================================================================

/**
 * Create a new domain
 *
 * WHY: Register a custom domain for an organization to host websites.
 * HOW: Creates domain record with proper race condition handling.
 *
 * VALIDATION:
 * - Domain must be globally unique across all organizations
 *
 * RACE CONDITION HANDLING:
 * - Pre-checks provide fast user feedback for obvious duplicates
 * - Database-level unique constraints catch concurrent requests
 * - P2002 errors are caught and converted to user-friendly messages
 *
 * @example
 * createDomain({
 *   organizationId: "org_123",
 *   customDomain: "webprodigies.com"
 * })
 */
export async function createDomain(input: DomainCreateInput) {
  const { organizationId, customDomain, userId } = input

  // Normalize domain: lowercase, strip any protocol prefix
  const normalizedDomain = customDomain.replace(/^https?:\/\//, '').toLowerCase()

  // Pre-check domain availability globally (fast user feedback)
  const domainAvailable = await isDomainAvailable(normalizedDomain)
  if (!domainAvailable) {
    throw new Error('Domain is already in use')
  }

  try {
    // Create domain - DB constraints catch any race conditions
    const domain = await prisma.domain.create({
      data: {
        organizationId,
        customDomain: normalizedDomain,
        isVerified: false,
      },
    })

    // Log the activity if userId is provided
    if (userId) {
      logActivity({
        userId,
        organizationId,
        action: 'create',
        entity: 'domain',
        entityId: domain.id,
      })
    }

    return domain
  } catch (error) {
    // Handle unique constraint violations from concurrent requests
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('Domain is already in use')
      }
    }
    throw error
  }
}

/**
 * Get a single domain by ID
 *
 * WHY: Retrieve full domain details for editing/viewing.
 * HOW: Simple findFirst with org verification.
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Domain ID to retrieve
 */
export async function getDomainById(organizationId: string, domainId: string) {
  return await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
    include: {
      websites: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

/**
 * List all domains for organization with pagination
 *
 * WHY: Provides paginated access to domains with search support.
 * HOW: Uses Prisma's pagination with search across customDomain.
 *
 * SEARCH: Searches the customDomain field.
 */
export async function listDomains(input: ListDomainsInput) {
  const { organizationId, search, page = 1, pageSize = 10 } = input

  // Build where clause - no soft delete filtering for domains
  const where = {
    organizationId,
    ...(search && {
      customDomain: { contains: search, mode: 'insensitive' as const },
    }),
  }

  // Get total count for pagination
  const total = await prisma.domain.count({ where })

  // Get paginated domains with their website counts
  const domains = await prisma.domain.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      _count: {
        select: { websites: { where: { deletedAt: null } } },
      },
    },
  })

  return {
    domains,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Update a domain
 *
 * WHY: Modify domain configuration (change to different domain).
 * HOW: Partial update with uniqueness checks and race condition handling.
 *
 * IMPORTANT:
 * - Changing domain requires DNS reconfiguration
 * - Affects all website URLs under this domain
 *
 * RACE CONDITION HANDLING:
 * - Pre-checks provide fast user feedback for obvious duplicates
 * - Database-level unique constraints catch concurrent requests
 * - P2002 errors are caught and converted to user-friendly messages
 */
export async function updateDomain(
  organizationId: string,
  domainId: string,
  data: DomainUpdateInput,
  userId?: string
) {
  // Normalize and check availability if changing domain
  let updateData: Record<string, unknown> = { ...data }
  if (data.customDomain) {
    const normalizedDomain = data.customDomain.replace(/^https?:\/\//, '').toLowerCase()
    const domainAvailable = await isDomainAvailable(normalizedDomain, domainId)
    if (!domainAvailable) {
      throw new Error('Domain is already in use')
    }
    // Reset verification when domain changes
    updateData = { customDomain: normalizedDomain, isVerified: false }
  }

  try {
    // Update domain - DB constraints catch any race conditions
    const domain = await prisma.domain.update({
      where: {
        id: domainId,
        organizationId,
      },
      data: updateData,
    })

    // Log the activity if userId is provided
    if (userId) {
      logActivity({
        userId,
        organizationId,
        action: 'update',
        entity: 'domain',
        entityId: domain.id,
      })
    }

    return domain
  } catch (error) {
    // Handle unique constraint violations from concurrent requests
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('Domain is already in use')
      }
    }
    throw error
  }
}

/**
 * Delete a domain (hard delete)
 *
 * WHY: Permanently removes domain from the database.
 * HOW: Uses Prisma delete to remove the record.
 *
 * CASCADING BEHAVIOR:
 * - Websites under this domain will have their domainId set to null (orphaned)
 * - Websites remain accessible via their previewId URL
 */
export async function deleteDomain(
  organizationId: string,
  domainId: string,
  userId?: string
) {
  const domain = await prisma.domain.delete({
    where: {
      id: domainId,
      organizationId,
    },
  })

  // Log the activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'domain',
      entityId: domain.id,
    })
  }

  return domain
}

/**
 * Check if domain is available globally
 *
 * WHY: Domains must be GLOBALLY unique across all organizations.
 * HOW: Checks for existing domain excluding current domain (for updates).
 *
 * VALIDATION NOTES:
 * - Domains are globally unique (not scoped to organization)
 * - This prevents multiple orgs from claiming the same domain
 * - Comparison is case-insensitive
 * - Also checks for variants with/without protocol (handles old data with https:// prefix)
 *
 * SOURCE OF TRUTH: DomainAvailability, GlobalUniqueness
 *
 * @param customDomain - Domain to check (e.g., "webprodigies.com")
 * @param excludeDomainId - Optional domain ID to exclude (for updates)
 */
export async function isDomainAvailable(
  customDomain: string,
  excludeDomainId?: string
): Promise<boolean> {
  const normalizedDomain = customDomain.replace(/^https?:\/\//, '').toLowerCase()

  const existing = await prisma.domain.findFirst({
    where: {
      OR: [
        { customDomain: { equals: normalizedDomain, mode: 'insensitive' } },
        { customDomain: { equals: `https://${normalizedDomain}`, mode: 'insensitive' } },
        { customDomain: { equals: `http://${normalizedDomain}`, mode: 'insensitive' } },
      ],
      ...(excludeDomainId && { NOT: { id: excludeDomainId } }),
    },
    select: { id: true },
  })
  return !existing
}

/**
 * Get domain by custom domain (for public routing)
 *
 * WHY: Used for resolving domains from custom domain URLs.
 * HOW: Looks up domain by customDomain field.
 *
 * USE CASE: When a request comes to "webprodigies.com/home", we need to:
 * 1. Find the domain with customDomain = "webprodigies.com"
 * 2. Then find the website with slug = "home" in that domain
 *
 * @param customDomain - Custom domain (e.g., "webprodigies.com")
 */
export async function getDomainByCustomDomain(customDomain: string) {
  return await prisma.domain.findFirst({
    where: {
      customDomain: { equals: customDomain, mode: 'insensitive' },
    },
    include: {
      websites: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

// ============================================================================
// DNS VERIFICATION OPERATIONS
// ============================================================================

/**
 * Get domain for DNS instructions display
 *
 * WHY: Users need to see their domain details alongside DNS setup instructions.
 * HOW: Returns the full domain record for the DNS instructions page.
 *
 * SOURCE OF TRUTH: DomainDnsInstructions, DomainVerification
 *
 * @param organizationId - Organization ID for security scoping
 * @param domainId - Domain ID to fetch
 */
export async function getDomainForDnsInstructions(
  organizationId: string,
  domainId: string
) {
  return await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })
}

/**
 * Verify domain DNS and update verification status
 *
 * WHY: After a user configures DNS records, we need to check them and persist the result.
 * HOW: Fetches domain, delegates DNS verification, then updates isVerified if changed.
 *
 * SOURCE OF TRUTH: DomainDnsVerification, DomainVerifiedStatus
 *
 * @param organizationId - Organization ID for security scoping
 * @param domainId - Domain ID to verify
 * @param verifyFn - The DNS verification function (injected from dns-verification.service)
 * @returns Verification result with domain metadata
 */
export async function verifyAndUpdateDomainDns(
  organizationId: string,
  domainId: string,
  verifyFn: (customDomain: string, domainId: string) => Promise<DnsVerificationResult>
) {
  const domain = await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    return null
  }

  // Perform DNS verification
  const verificationResult = await verifyFn(domain.customDomain, domain.id)

  // Update the domain verification status if changed
  if (verificationResult.verified !== domain.isVerified) {
    await prisma.domain.update({
      where: { id: domain.id },
      data: { isVerified: verificationResult.verified },
    })
  }

  return {
    ...verificationResult,
    domainId: domain.id,
    customDomain: domain.customDomain,
  }
}

// ============================================================================
// DOMAIN PAGE OPERATIONS
// ============================================================================

/**
 * Get all published pages available for a domain
 *
 * WHY: Populates the default page dropdown in domain settings.
 * HOW: Returns all PUBLISHED pages from websites under this domain.
 *
 * SOURCE OF TRUTH: DomainPages, DefaultPageDropdown
 *
 * @param organizationId - Organization ID for security scoping
 * @param domainId - Domain ID to get pages for
 */
export async function getDomainPages(organizationId: string, domainId: string) {
  // First check if domain exists and get its defaultPageId
  const domain = await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
    select: {
      id: true,
      defaultPageId: true,
    },
  })

  if (!domain) {
    return null
  }

  // Get all websites under this domain
  const websites = await prisma.website.findMany({
    where: {
      domainId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  })

  // If no websites, return early with helpful state
  if (websites.length === 0) {
    return {
      pages: [],
      hasPages: false,
      hasWebsites: false,
      currentDefaultPageId: domain.defaultPageId,
    }
  }

  // Get all PUBLISHED pages from this domain
  const pages = await prisma.page.findMany({
    where: {
      domainId,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      website: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { website: { name: 'asc' } },
      { name: 'asc' },
    ],
  })

  return {
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      slug: page.slug,
      websiteName: page.website.name,
    })),
    hasPages: pages.length > 0,
    hasWebsites: true,
    currentDefaultPageId: domain.defaultPageId,
  }
}

/**
 * Set or clear the default page for a domain
 *
 * WHY: When visitors access the root of a domain, they should see a specific page.
 * HOW: Validates page exists and is published, then updates defaultPageId on domain.
 *
 * SOURCE OF TRUTH: DomainDefaultPage, RootDomainRedirect
 *
 * @param organizationId - Organization ID for security scoping
 * @param domainId - Domain ID to update
 * @param defaultPageId - Page ID to set as default, or null to clear
 * @returns Result with success status and message
 */
export async function setDomainDefaultPage(
  organizationId: string,
  domainId: string,
  defaultPageId: string | null
) {
  // Verify domain exists
  const domain = await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
    select: { id: true },
  })

  if (!domain) {
    return { found: false as const }
  }

  // If clearing the default page, just update to null
  if (defaultPageId === null) {
    await prisma.domain.update({
      where: { id: domainId },
      data: { defaultPageId: null },
    })
    return { found: true as const, success: true, message: 'Default page cleared' }
  }

  // Verify page exists, is PUBLISHED, and belongs to this domain
  const page = await prisma.page.findFirst({
    where: {
      id: defaultPageId,
      domainId,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: { id: true, name: true },
  })

  if (!page) {
    return { found: true as const, pageNotFound: true as const }
  }

  // Update the domain with the new default page
  await prisma.domain.update({
    where: { id: domainId },
    data: { defaultPageId },
  })

  return { found: true as const, success: true, message: `Default page set to "${page.name}"` }
}

/**
 * Get domain by ID with website count (for router list/getById)
 *
 * WHY: Router needs domain with _count for display purposes.
 * HOW: Returns domain with website count included.
 *
 * SOURCE OF TRUTH: DomainWithCount, DomainListItem
 *
 * @param organizationId - Organization ID for security scoping
 * @param domainId - Domain ID to retrieve
 */
export async function getDomainWithCount(organizationId: string, domainId: string) {
  return await prisma.domain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
    include: {
      _count: {
        select: { websites: true },
      },
    },
  })
}
