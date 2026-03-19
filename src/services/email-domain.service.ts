/**
 * EMAIL DOMAIN SERVICE (DAL)
 *
 * Data Access Layer for email domain operations with Resend integration.
 * This is the ONLY place that should interact with Prisma and Resend for email domains.
 *
 * EMAIL DOMAIN ARCHITECTURE:
 * ==========================
 *
 * An EmailDomain allows organizations to send emails from their custom domain:
 * - name: "example.com" (the domain to send from)
 * - region: Data center region for email delivery
 * - resendDomainId: External ID from Resend API
 * - status: Verification status (NOT_STARTED, PENDING, VERIFIED, FAILED)
 * - dnsRecords: Required DNS records for verification (SPF, DKIM, etc.)
 *
 * WORKFLOW:
 * 1. User adds domain via createEmailDomain()
 * 2. System registers with Resend and stores DNS records
 * 3. User adds DNS records to their domain provider
 * 4. User triggers verification via verifyEmailDomain()
 * 5. Once VERIFIED, emails can be sent from that domain
 *
 * SOURCE OF TRUTH: Resend API for domain status, Prisma for local cache
 */

import 'server-only'
import { prisma } from '@/lib/config'
import {
  resend,
  ResendDnsRecord,
  ResendRegion,
  mapResendStatusToEnum,
} from '@/lib/config/resend'
import { EmailDomainStatus, Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'

// ============================================================================
// GLOBAL UNIQUENESS CHECK FOR EMAIL DOMAINS
// ============================================================================

/**
 * Check if an email domain name is globally available
 *
 * WHY: Email domains MUST be globally unique across all organizations
 * because you can't have two organizations claiming the same domain
 * for email sending (e.g., only one org can own "example.com")
 *
 * HOW: Checks if any organization already has this email domain registered
 *
 * @param name - Email domain name to check (e.g., "example.com")
 * @param excludeDomainId - Optional domain ID to exclude (for updates)
 * @returns true if the domain is available, false if already taken
 */
export async function isEmailDomainNameGloballyAvailable(
  name: string,
  excludeDomainId?: string
): Promise<boolean> {
  const existing = await prisma.emailDomain.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeDomainId && { NOT: { id: excludeDomainId } }),
    },
    select: { id: true },
  })
  return !existing
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse DNS records from Prisma JSON field
 *
 * WHY: Prisma's Json type is generic, but data comes directly from Resend API
 * HOW: Validates array structure, then maps to typed records
 *
 * SOURCE OF TRUTH: ResendDnsRecord is defined in @/lib/config/resend
 * DATA ORIGIN: Resend API domains.create() / domains.get() response
 */
function parseDnsRecords(json: Prisma.JsonValue | null): ResendDnsRecord[] {
  if (!json || !Array.isArray(json)) return []

  // Data comes directly from Resend API, map each record with validation
  return json.map((item): ResendDnsRecord => {
    const record = item as Prisma.JsonObject
    return {
      record: String(record.record ?? ''),
      name: String(record.name ?? ''),
      type: String(record.type ?? ''),
      ttl: String(record.ttl ?? ''),
      status: (record.status as ResendDnsRecord['status']) ?? 'not_started',
      value: String(record.value ?? ''),
      priority: typeof record.priority === 'number' ? record.priority : undefined,
    }
  })
}

// ============================================================================
// TYPES - SOURCE OF TRUTH for email domain operations
// ============================================================================

/**
 * Input for creating a new email domain
 * SOURCE OF TRUTH: Used by tRPC router and UI forms
 *
 * CAPABILITIES:
 * - sendingEnabled: Allow sending emails FROM this domain (default: true)
 * - receivingEnabled: Allow receiving emails TO this domain (default: true)
 *
 * When receiving is enabled, Resend returns an MX record that must be added
 * to DNS for inbound emails to work.
 */
export type EmailDomainCreateInput = {
  organizationId: string
  name: string
  region?: ResendRegion
  /** Enable receiving emails to this domain (adds MX record requirement) */
  receivingEnabled?: boolean
  /** User ID for activity logging */
  userId?: string
}

/**
 * Input for listing email domains
 * SOURCE OF TRUTH: Used by tRPC router for pagination
 */
export type ListEmailDomainsInput = {
  organizationId: string
  page?: number
  pageSize?: number
}

/**
 * Email domain with parsed DNS records
 * SOURCE OF TRUTH: Return type for domain queries
 */
export type EmailDomainWithRecords = {
  id: string
  organizationId: string
  name: string
  region: string
  resendDomainId: string
  status: EmailDomainStatus
  dnsRecords: ResendDnsRecord[]
  sendingEnabled: boolean
  receivingEnabled: boolean
  openTracking: boolean
  clickTracking: boolean
  createdAt: Date
  updatedAt: Date
  verifiedAt: Date | null
}

// ============================================================================
// EMAIL DOMAIN CRUD OPERATIONS
// ============================================================================

/**
 * Create a new email domain
 *
 * WHY: Register a custom domain with Resend for email sending AND receiving.
 * HOW: Creates domain in Resend API with both capabilities enabled,
 *      stores reference and DNS records locally.
 *
 * WORKFLOW:
 * 1. Check domain name uniqueness GLOBALLY (not just within org!)
 * 2. Register domain with Resend API (sending + receiving enabled)
 * 3. Store domain reference and DNS records in database
 * 4. User must add ALL DNS records (SPF, DKIM, DMARC, AND MX for receiving)
 * 5. User triggers verification
 * 6. Once verified, emails can be sent FROM and received TO this domain
 *
 * RECEIVING EMAILS:
 * When receivingEnabled is true (default), Resend returns an MX record.
 * Once the MX record is added and verified, emails TO this domain
 * will trigger the webhook at /api/resend/webhook.
 *
 * GLOBAL UNIQUENESS:
 * Email domains MUST be globally unique because only one organization
 * can claim a domain for email sending. Resend also enforces this.
 *
 * RACE CONDITION HANDLING:
 * - Pre-checks provide fast user feedback for obvious duplicates
 * - Resend API rejects duplicate domains (their own uniqueness check)
 * - Database constraints catch any remaining edge cases
 * - P2002 errors are caught and converted to user-friendly messages
 *
 * @param input - Domain creation input with organizationId and name
 * @throws Error if domain already exists globally or Resend API fails
 */
export async function createEmailDomain(
  input: EmailDomainCreateInput
): Promise<EmailDomainWithRecords> {
  const { organizationId, name, region = 'us-east-1', receivingEnabled = true, userId } = input

  // CRITICAL FIX: Check domain name uniqueness GLOBALLY (not just within org!)
  // Email domains must be unique across all organizations because only one
  // entity can own/verify a domain for email sending
  const isAvailable = await isEmailDomainNameGloballyAvailable(name)
  if (!isAvailable) {
    throw new Error('Email domain is already registered by another organization')
  }

  /**
   * Register domain with Resend API
   *
   * WHY: Enable both sending AND receiving by default
   * HOW: Pass capabilities object to Resend API
   *
   * When receiving is enabled, Resend includes MX record in the response.
   * The MX record must be added to DNS for inbound emails to work.
   *
   * CAPABILITIES FORMAT (from Resend SDK):
   * - sending: 'enabled' | 'disabled'
   * - receiving: 'enabled' | 'disabled'
   *
   * NOTE: Resend also enforces global uniqueness - if another Resend customer
   * has this domain, it will be rejected. This is expected and handled below.
   */
  const { data: resendDomain, error } = await resend.domains.create({
    name,
    region,
    capabilities: {
      sending: 'enabled',
      receiving: receivingEnabled ? 'enabled' : 'disabled',
    },
  })

  if (error || !resendDomain) {
    console.error('[Resend] Domain creation failed:', error)
    // Resend may reject due to global uniqueness (domain already in another Resend account)
    const errorMessage = error?.message || 'Failed to create domain with Resend'
    if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('exist')) {
      throw new Error('Email domain is already registered (possibly in another Resend account)')
    }
    throw new Error(errorMessage)
  }

  try {
    // Store domain in database with DNS records from Resend
    const emailDomain = await prisma.emailDomain.create({
      data: {
        organizationId,
        name: resendDomain.name,
        region,
        resendDomainId: resendDomain.id,
        status: mapResendStatusToEnum(resendDomain.status),
        dnsRecords: resendDomain.records as unknown as object,
        sendingEnabled: true,
        receivingEnabled,
      },
    })

    // Log activity if userId is provided
    if (userId) {
      logActivity({
        userId,
        organizationId,
        action: 'create',
        entity: 'email_domain',
        entityId: emailDomain.id,
      })
    }

    return {
      ...emailDomain,
      dnsRecords: parseDnsRecords(emailDomain.dnsRecords),
    }
  } catch (error) {
    // Handle unique constraint violations from concurrent requests
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Clean up Resend domain since we couldn't save locally
        try {
          await resend.domains.remove(resendDomain.id)
        } catch (cleanupError) {
          console.error('[Resend] Failed to cleanup domain after DB error:', cleanupError)
        }
        throw new Error('Email domain is already registered')
      }
    }
    throw error
  }
}

/**
 * Get email domain by ID with LIVE status from Resend
 *
 * WHY: Retrieve full domain details with real-time status
 * HOW: Fetches local record, then gets live data from Resend API
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to retrieve
 */
export async function getEmailDomainById(
  organizationId: string,
  domainId: string
): Promise<EmailDomainWithRecords | null> {
  const localDomain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!localDomain) return null

  // Fetch live data from Resend
  try {
    const { data: resendDomain, error } = await resend.domains.get(
      localDomain.resendDomainId
    )

    if (error || !resendDomain) {
      console.warn(`[Resend] Failed to fetch domain ${localDomain.name}:`, error)
      return {
        ...localDomain,
        dnsRecords: parseDnsRecords(localDomain.dnsRecords),
      }
    }

    // Return live data
    return {
      ...localDomain,
      status: mapResendStatusToEnum(resendDomain.status),
      dnsRecords: parseDnsRecords(resendDomain.records as unknown as Prisma.JsonValue),
    }
  } catch (err) {
    console.error(`[Resend] Error fetching domain ${localDomain.name}:`, err)
    return {
      ...localDomain,
      dnsRecords: parseDnsRecords(localDomain.dnsRecords),
    }
  }
}

/**
 * List all email domains for organization with LIVE status from Resend
 *
 * WHY: Display domains with real-time status from Resend API
 * HOW: Fetches local records, then gets live status from Resend for each
 *
 * ARCHITECTURE: We store resendDomainId locally, but always fetch live
 * status/records from Resend API to ensure accuracy
 *
 * @param input - List input with pagination options
 */
export async function listEmailDomains(input: ListEmailDomainsInput) {
  const { organizationId, page = 1, pageSize = 10 } = input

  const where = { organizationId }

  // Get total count for pagination
  const total = await prisma.emailDomain.count({ where })

  // Get paginated domains from our DB
  const localDomains = await prisma.emailDomain.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  // Fetch live status from Resend for each domain
  const domains = await Promise.all(
    localDomains.map(async (localDomain) => {
      try {
        // Get live data from Resend
        const { data: resendDomain, error } = await resend.domains.get(
          localDomain.resendDomainId
        )

        if (error || !resendDomain) {
          // If Resend fails, return cached data with warning
          console.warn(`[Resend] Failed to fetch domain ${localDomain.name}:`, error)
          return {
            ...localDomain,
            dnsRecords: parseDnsRecords(localDomain.dnsRecords),
          }
        }

        // Update local cache in background (fire and forget)
        const newStatus = mapResendStatusToEnum(resendDomain.status)
        prisma.emailDomain
          .update({
            where: { id: localDomain.id },
            data: {
              status: newStatus,
              dnsRecords: resendDomain.records as unknown as object,
              verifiedAt: newStatus === 'VERIFIED' && !localDomain.verifiedAt
                ? new Date()
                : localDomain.verifiedAt,
            },
          })
          .catch((err) => console.error('[Prisma] Failed to update domain cache:', err))

        // Return live data from Resend
        return {
          ...localDomain,
          status: newStatus,
          dnsRecords: parseDnsRecords(resendDomain.records as unknown as Prisma.JsonValue),
        }
      } catch (err) {
        console.error(`[Resend] Error fetching domain ${localDomain.name}:`, err)
        return {
          ...localDomain,
          dnsRecords: parseDnsRecords(localDomain.dnsRecords),
        }
      }
    })
  )

  return {
    domains,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Verify email domain DNS records
 *
 * WHY: Trigger DNS record verification after user adds them.
 * HOW: Calls Resend API to check DNS records and updates local status.
 *
 * WORKFLOW:
 * 1. Call Resend verify endpoint
 * 2. Fetch updated domain from Resend to get new status
 * 3. Update local database with new status and records
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to verify
 */
export async function verifyEmailDomain(
  organizationId: string,
  domainId: string
): Promise<EmailDomainWithRecords> {
  // Get existing domain
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  // Trigger verification with Resend
  const { error: verifyError } = await resend.domains.verify(
    domain.resendDomainId
  )

  if (verifyError) {
    throw new Error(verifyError.message || 'Failed to verify domain')
  }

  // Fetch updated domain status from Resend
  const { data: resendDomain, error: getError } = await resend.domains.get(
    domain.resendDomainId
  )

  if (getError || !resendDomain) {
    throw new Error(getError?.message || 'Failed to get domain status')
  }

  // Update local database with new status
  const newStatus = mapResendStatusToEnum(resendDomain.status)
  const updatedDomain = await prisma.emailDomain.update({
    where: { id: domainId },
    data: {
      status: newStatus,
      dnsRecords: resendDomain.records as unknown as object,
      verifiedAt: newStatus === 'VERIFIED' ? new Date() : null,
    },
  })

  return {
    ...updatedDomain,
    dnsRecords: parseDnsRecords(updatedDomain.dnsRecords),
  }
}

/**
 * Refresh email domain status from Resend
 *
 * WHY: Get latest DNS record status without triggering new verification.
 * HOW: Fetches current domain state from Resend and syncs locally.
 *
 * USE CASE: Polling for status updates or refreshing stale data.
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to refresh
 */
export async function refreshEmailDomainStatus(
  organizationId: string,
  domainId: string
): Promise<EmailDomainWithRecords> {
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  // Fetch current status from Resend
  const { data: resendDomain, error } = await resend.domains.get(
    domain.resendDomainId
  )

  if (error || !resendDomain) {
    throw new Error(error?.message || 'Failed to get domain status from Resend')
  }

  // Update local database
  const newStatus = mapResendStatusToEnum(resendDomain.status)
  const updatedDomain = await prisma.emailDomain.update({
    where: { id: domainId },
    data: {
      status: newStatus,
      dnsRecords: resendDomain.records as unknown as object,
      verifiedAt:
        newStatus === 'VERIFIED' && !domain.verifiedAt ? new Date() : undefined,
    },
  })

  return {
    ...updatedDomain,
    dnsRecords: parseDnsRecords(updatedDomain.dnsRecords),
  }
}

/**
 * Delete email domain
 *
 * WHY: Remove domain from both Resend and local database.
 * HOW: Deletes from Resend API first, then removes local record.
 *
 * IMPORTANT: This is a hard delete, not soft delete.
 * Emails can no longer be sent from this domain after deletion.
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to delete
 * @param userId - Optional user ID for activity logging
 */
export async function deleteEmailDomain(
  organizationId: string,
  domainId: string,
  userId?: string
): Promise<void> {
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  // Delete from Resend first
  const { error } = await resend.domains.remove(domain.resendDomainId)

  if (error) {
    // If domain already deleted from Resend, proceed with local deletion
    if (!error.message?.includes('not found')) {
      throw new Error(error.message || 'Failed to delete domain from Resend')
    }
  }

  // Delete from local database
  await prisma.emailDomain.delete({
    where: { id: domainId },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'email_domain',
      entityId: domainId,
    })
  }
}

/**
 * Get verified email domain for sending
 *
 * WHY: Find a verified domain to use as email sender.
 * HOW: Returns first verified domain for the organization.
 *
 * USE CASE: When sending emails, get a verified domain to use in "from" address.
 *
 * @param organizationId - Organization ID to find verified domain for
 */
export async function getVerifiedEmailDomain(
  organizationId: string
): Promise<EmailDomainWithRecords | null> {
  const domain = await prisma.emailDomain.findFirst({
    where: {
      organizationId,
      status: 'VERIFIED',
      sendingEnabled: true,
    },
    orderBy: { createdAt: 'asc' }, // Prefer oldest (likely primary domain)
  })

  if (!domain) return null

  return {
    ...domain,
    dnsRecords: parseDnsRecords(domain.dnsRecords),
  }
}

/**
 * Toggle sending enabled for email domain
 *
 * WHY: Allow org admins to disable sending from a domain temporarily.
 * HOW: Updates sendingEnabled flag without affecting Resend status.
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to toggle
 * @param enabled - Whether sending should be enabled
 * @param userId - Optional user ID for activity logging
 */
export async function toggleEmailDomainSending(
  organizationId: string,
  domainId: string,
  enabled: boolean,
  userId?: string
): Promise<EmailDomainWithRecords> {
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  const updatedDomain = await prisma.emailDomain.update({
    where: { id: domainId },
    data: { sendingEnabled: enabled },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_domain',
      entityId: updatedDomain.id,
    })
  }

  return {
    ...updatedDomain,
    dnsRecords: parseDnsRecords(updatedDomain.dnsRecords),
  }
}

/**
 * Toggle receiving enabled for email domain
 *
 * WHY: Allow org admins to enable/disable receiving emails TO this domain.
 * HOW: Updates receivingEnabled flag in our database.
 *
 * IMPORTANT: This only affects our app's handling. The MX record must still
 * be configured in DNS for emails to actually arrive at Resend.
 *
 * FLOW FOR RECEIVING EMAILS:
 * 1. Customer adds domain with receiving enabled
 * 2. Customer adds MX record to their DNS
 * 3. MX record verified → emails TO this domain go to Resend
 * 4. Resend fires webhook → our app receives and processes
 * 5. This flag controls whether we process those emails
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to toggle
 * @param enabled - Whether receiving should be enabled
 * @param userId - Optional user ID for activity logging
 */
export async function toggleEmailDomainReceiving(
  organizationId: string,
  domainId: string,
  enabled: boolean,
  userId?: string
): Promise<EmailDomainWithRecords> {
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  const updatedDomain = await prisma.emailDomain.update({
    where: { id: domainId },
    data: { receivingEnabled: enabled },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_domain',
      entityId: updatedDomain.id,
    })
  }

  return {
    ...updatedDomain,
    dnsRecords: parseDnsRecords(updatedDomain.dnsRecords),
  }
}

/**
 * Update email tracking settings for a domain
 *
 * WHY: Allow users to enable/disable email open and click tracking per domain.
 * HOW: Updates both Resend API (via PATCH /domains/:domain_id) and local database.
 *
 * RESEND API:
 * - openTracking: Track when recipients open emails (1x1 pixel image)
 * - clickTracking: Track when recipients click links (redirect through Resend)
 *
 * PRIVACY CONSIDERATIONS:
 * - Open tracking uses invisible pixel - may be blocked by some email clients
 * - Click tracking rewrites links - changes visible URLs in email
 * - Both are disabled by default for privacy
 *
 * SOURCE OF TRUTH KEYWORDS: UpdateEmailTracking, ToggleTracking
 *
 * @param organizationId - Organization ID for security check
 * @param domainId - Email domain ID to update
 * @param openTracking - Whether to track email opens
 * @param clickTracking - Whether to track link clicks
 * @param userId - Optional user ID for activity logging
 */
export async function updateEmailDomainTracking(
  organizationId: string,
  domainId: string,
  openTracking: boolean,
  clickTracking: boolean,
  userId?: string
): Promise<EmailDomainWithRecords> {
  // Verify domain belongs to organization
  const domain = await prisma.emailDomain.findFirst({
    where: {
      id: domainId,
      organizationId,
    },
  })

  if (!domain) {
    throw new Error('Email domain not found')
  }

  // Update tracking settings in Resend via PATCH /domains/:domain_id
  // WHY: The Resend SDK doesn't expose the update method, so we use fetch directly
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  // NOTE: The Resend API uses snake_case, not camelCase
  // The SDK uses camelCase but converts internally. Since we're using fetch directly,
  // we must use snake_case field names.
  const resendResponse = await fetch(
    `https://api.resend.com/domains/${domain.resendDomainId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        open_tracking: openTracking,
        click_tracking: clickTracking,
      }),
    }
  )

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text().catch(() => 'Unknown error')
    console.error('[Resend] Failed to update tracking settings:', errorText)
    throw new Error(`Failed to update tracking settings in Resend`)
  }

  // Update local database to keep in sync
  const updatedDomain = await prisma.emailDomain.update({
    where: { id: domainId },
    data: {
      openTracking,
      clickTracking,
    },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_domain',
      entityId: updatedDomain.id,
    })
  }

  return {
    ...updatedDomain,
    dnsRecords: parseDnsRecords(updatedDomain.dnsRecords),
  }
}
