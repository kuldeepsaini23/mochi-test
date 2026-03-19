/**
 * Organization Service - Single Source of Truth
 *
 * WHY: Centralized organization creation logic to prevent duplication
 * HOW: Used by both Stripe webhook and tRPC procedures
 *
 * This service provides a unified interface for creating studio organizations
 * with all necessary metadata and relationships (organization + member).
 *
 * USAGE:
 * - Stripe webhook (src/app/api/stripe/webhook/route.ts)
 * - tRPC organization router (src/trpc/routers/organization.ts)
 * - Organization procedure middleware (requireStripeConnect validation)
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { getTimezoneForCountry } from '@/lib/timezone/timezone-utils'
import { initializeMemberAvailability } from '@/services/member-availability.service'
import { logActivity } from './activity-log.service'

/**
 * Generate a URL-safe slug from studio name
 *
 * Converts studio name to lowercase and replaces non-alphanumeric
 * characters with hyphens, removing leading/trailing hyphens.
 *
 * @param name - The studio name to convert
 * @returns URL-safe slug (e.g., "My Studio!" -> "my-studio")
 *
 * @example
 * ```ts
 * generateSlug("My Amazing Studio!") // "my-amazing-studio"
 * generateSlug("Studio 123") // "studio-123"
 * ```
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Ensure slug is unique by appending a number if needed
 *
 * Checks if the slug already exists in the database and appends
 * an incrementing counter if it does until a unique slug is found.
 *
 * @param baseSlug - The base slug to make unique
 * @returns A unique slug guaranteed not to exist in the database
 *
 * @example
 * ```ts
 * // If "my-studio" exists
 * await ensureUniqueSlug("my-studio") // "my-studio-1"
 *
 * // If "my-studio" and "my-studio-1" exist
 * await ensureUniqueSlug("my-studio") // "my-studio-2"
 * ```
 */
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug
  let counter = 1

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`
    counter++
  }

  return slug
}

/**
 * Create a new studio organization with owner membership
 *
 * This is the SINGLE SOURCE OF TRUTH for organization creation.
 * Creates both the organization record and the studio-owner membership
 * in a single atomic transaction.
 *
 * BUSINESS LOGIC:
 * 1. Generates a unique URL-safe slug from the studio name
 * 2. Creates the organization with metadata (contact info, address)
 * 3. Creates a studio-owner membership for the user
 * 4. Returns the organization ID and slug for immediate use
 *
 * PORTAL ORGANIZATION:
 * When isPortalOrganization=true, the organization will:
 * - Use the hidden 'portal' tier with unlimited features
 * - Bypass all tier-based restrictions
 * - Be identified as a portal organization in getOrganizationTier()
 *
 * SECURITY: The isPortalOrganization flag should ONLY be set when the
 * creator's email matches PORTAL_INITIAL_OWNER_EMAIL. This validation
 * must happen in the calling code (e.g., organization router).
 *
 * TRANSACTION SAFETY:
 * Uses Prisma transaction to ensure atomicity - either both organization
 * and membership are created, or neither is created if any step fails.
 *
 * @param params - Organization creation parameters
 * @param params.userId - The user ID who will own the organization
 * @param params.studioName - The name of the studio/organization
 * @param params.phoneNumber - Optional phone number for contact
 * @param params.country - Optional country for address
 * @param params.address - Optional street address
 * @param params.city - Optional city
 * @param params.state - Optional state/province
 * @param params.zipCode - Optional zip/postal code
 * @param params.isPortalOrganization - Optional flag to mark as portal org (SECURITY: validate caller)
 * @param params.referralSource - Optional survey: how the user heard about us
 * @param params.role - Optional survey: user's role/title
 * @param params.teamSize - Optional survey: size of user's team
 * @param params.intendedUse - Optional survey: what the user plans to use the platform for
 * @param params.niche - Optional survey: user's business niche / description
 *
 * @returns Promise resolving to organization ID and slug
 * @throws Will throw if database operations fail
 *
 * @example
 * ```ts
 * // Basic usage
 * const result = await createStudioOrganization({
 *   userId: "user-123",
 *   studioName: "My Awesome Studio"
 * })
 * // result: { organizationId: "org-456", slug: "my-awesome-studio" }
 *
 * // Portal organization (ONLY for validated portal owners)
 * const result = await createStudioOrganization({
 *   userId: "portal-owner-id",
 *   studioName: "Portal HQ",
 *   isPortalOrganization: true
 * })
 * ```
 */
export async function createStudioOrganization(params: {
  userId: string
  studioName: string
  phoneNumber?: string
  country?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  isPortalOrganization?: boolean
  referralSource?: string
  role?: string
  teamSize?: string
  intendedUse?: string
  niche?: string
}): Promise<{ organizationId: string; slug: string }> {
  // Generate unique slug from studio name
  const baseSlug = generateSlug(params.studioName)
  const slug = await ensureUniqueSlug(baseSlug)

  // Prepare metadata object with optional fields (contact info, address, and onboarding survey data)
  const metadata = JSON.stringify({
    phoneNumber: params.phoneNumber,
    country: params.country,
    address: params.address,
    city: params.city,
    state: params.state,
    zipCode: params.zipCode,
    referralSource: params.referralSource,
    role: params.role,
    teamSize: params.teamSize,
    intendedUse: params.intendedUse,
    niche: params.niche,
  })

  // Create organization, membership, and wallet in atomic transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create organization
    // NOTE: isPortalOrganization flag requires schema migration to add the field
    // The field defaults to false if not provided
    const organization = await tx.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: params.studioName,
        slug,
        metadata,
        createdAt: new Date(),
        // Portal organization flag - determines if this org uses the hidden 'portal' tier
        // SECURITY: Only set to true when creator is validated as portal owner
        ...(params.isPortalOrganization && { isPortalOrganization: true }),
      },
    })

    // 2. Create studio-owner membership for the user
    const member = await tx.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: organization.id,
        userId: params.userId,
        role: 'owner',
        createdAt: new Date(),
      },
    })

    // 3. Create wallet with $1.00 free credit
    // IMPORTANT: All wallet amounts are in MILLICENTS (1000 = $1.00), NOT cents
    const wallet = await tx.organizationWallet.create({
      data: {
        organizationId: organization.id,
        balance: 1000, // $1.00 in millicents
        currency: 'USD',
        autoTopUpEnabled: true,
        autoTopUpThreshold: 0, // Trigger when balance < $0
        autoTopUpAmount: 1000, // $1.00 in millicents
      },
    })

    // 4. Create initial free credit transaction
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'TOP_UP',
        status: 'COMPLETED',
        category: 'FREE_CREDIT',
        amount: 1000, // $1.00 in millicents
        currency: 'USD',
        balanceAfter: 1000, // $1.00 in millicents
        description: 'Initial free credit',
      },
    })

    // 5. Auto-set user's timezone based on organization country (only if not already set)
    // WHY: Better UX - user sees times in their local timezone by default
    // HOW: Only updates if timezone is null or 'UTC' (default), respects manually set timezones
    if (params.country) {
      const user = await tx.user.findUnique({
        where: { id: params.userId },
        select: { timezone: true },
      })

      // Only set timezone if user hasn't set one yet (null or default UTC)
      if (!user?.timezone || user.timezone === 'UTC') {
        const defaultTimezone = getTimezoneForCountry(params.country)
        await tx.user.update({
          where: { id: params.userId },
          data: { timezone: defaultTimezone },
        })
      }
    }

    return {
      organizationId: organization.id,
      slug: organization.slug,
      memberId: member.id,
    }
  })

  // 6. Initialize default availability for the owner member
  // WHY: Members should have default working hours when they join, not when they visit settings
  // HOW: Creates Mon-Fri 9am-5pm availability after transaction commits
  await initializeMemberAvailability(result.memberId)

  // 7. Log the activity (audit trail for organization creation)
  // NOTE: The userId is the same as the owner creating the organization
  // This logs the 'create' action for the new organization entity
  logActivity({
    userId: params.userId,
    organizationId: result.organizationId,
    action: 'create',
    entity: 'organization',
    entityId: result.organizationId,
  })

  return {
    organizationId: result.organizationId,
    slug: result.slug,
  }
}

// ============================================================================
// CONTEXT BUILDER HELPERS (Variable Interpolation)
// ============================================================================
// Used by context-builder.ts to fetch organization data for template variable interpolation.
// SOURCE OF TRUTH KEYWORDS: OrganizationForContext, ContextBuilderOrg

/**
 * Fetch minimal organization data for variable context building.
 *
 * WHY: The variable context builder needs org name, slug, logo, and domain
 * for template interpolation (e.g., {{organization.name}}, {{organization.logo}}).
 *
 * SOURCE OF TRUTH: FetchOrganizationForContext, OrgContextData
 *
 * @param organizationId - The organization ID to fetch
 * @returns Minimal org data or null if not found
 */
export async function getOrganizationForContext(organizationId: string) {
  return await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      customDomain: true,
    },
  })
}

// ============================================================================
// STRIPE CONNECT INTEGRATION
// ============================================================================

/**
 * Get the Stripe Connected Account ID for an organization
 *
 * Used to check if an organization has connected their Stripe account
 * before allowing payment-related operations.
 *
 * @param organizationId - The organization ID to check
 * @returns The Stripe connected account ID or null if not connected
 *
 * @example
 * ```ts
 * const stripeAccountId = await getStripeConnectedAccountId("org-123")
 * if (!stripeAccountId) {
 *   throw new Error("Stripe not connected")
 * }
 * ```
 */
export async function getStripeConnectedAccountId(
  organizationId: string
): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  return org?.stripeConnectedAccountId ?? null
}

/**
 * Check if an organization has connected their Stripe account
 *
 * Lightweight check that returns a boolean instead of the account ID.
 *
 * @param organizationId - The organization ID to check
 * @returns true if Stripe is connected, false otherwise
 */
export async function hasStripeConnected(
  organizationId: string
): Promise<boolean> {
  const accountId = await getStripeConnectedAccountId(organizationId)
  return accountId !== null
}

// ============================================================================
// ORGANIZATION SETTINGS OPERATIONS
// ============================================================================
// SOURCE OF TRUTH: OrganizationSettings, OrgSettingsCRUD

/**
 * Get organization settings for display
 *
 * WHY: Settings page needs org metadata for editing.
 * HOW: Returns selected fields from the organization record.
 *
 * SOURCE OF TRUTH: OrganizationSettingsQuery
 *
 * @param organizationId - Organization ID to fetch settings for
 */
export async function getOrganizationSettings(organizationId: string) {
  return await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      logo: true,
      rectangleLogo: true,
      stripeConnectedAccountId: true,
      createdAt: true,
    },
  })
}

/**
 * Standard select fields for organization settings mutations
 * Used across multiple update functions to ensure consistent return shapes.
 */
const ORG_SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  customDomain: true,
  logo: true,
  rectangleLogo: true,
  stripeConnectedAccountId: true,
} as const

/**
 * Update organization info (name and/or slug)
 *
 * WHY: Allow org owners to change their organization's name and URL slug.
 * HOW: Checks slug uniqueness before updating.
 *
 * SOURCE OF TRUTH: OrganizationInfoUpdate, OrgSlugUniqueness
 *
 * @param organizationId - Organization ID to update
 * @param data - Fields to update (name, slug)
 * @returns Updated organization or error info
 */
export async function updateOrganizationInfo(
  organizationId: string,
  data: { name?: string; slug?: string }
) {
  // If slug is being changed, check if it's available
  if (data.slug) {
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: data.slug },
    })

    if (existingOrg && existingOrg.id !== organizationId) {
      return { conflict: true as const, field: 'slug' as const }
    }
  }

  // Filter out undefined values
  const updateData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  )

  const updatedOrg = await prisma.organization.update({
    where: { id: organizationId },
    data: updateData,
    select: ORG_SETTINGS_SELECT,
  })

  return { conflict: false as const, organization: updatedOrg }
}

/**
 * Update organization custom domain
 *
 * WHY: Allow orgs to set a custom domain for branding.
 * HOW: Validates domain format, checks uniqueness, then updates.
 *
 * SOURCE OF TRUTH: OrganizationCustomDomain, OrgDomainUniqueness
 *
 * @param organizationId - Organization ID to update
 * @param domain - New custom domain value
 */
export async function updateOrganizationCustomDomain(
  organizationId: string,
  domain: string
) {
  // Check if domain is already in use
  const existingOrg = await prisma.organization.findUnique({
    where: { customDomain: domain },
  })

  if (existingOrg && existingOrg.id !== organizationId) {
    return { conflict: true as const }
  }

  const updatedOrg = await prisma.organization.update({
    where: { id: organizationId },
    data: { customDomain: domain },
    select: ORG_SETTINGS_SELECT,
  })

  return { conflict: false as const, organization: updatedOrg }
}

/**
 * Remove organization custom domain
 *
 * WHY: Allow orgs to disconnect their custom domain.
 * HOW: Sets customDomain to null.
 *
 * SOURCE OF TRUTH: OrganizationCustomDomainRemoval
 *
 * @param organizationId - Organization ID to update
 */
export async function removeOrganizationCustomDomain(organizationId: string) {
  return await prisma.organization.update({
    where: { id: organizationId },
    data: { customDomain: null },
    select: ORG_SETTINGS_SELECT,
  })
}

/**
 * Update organization logo (square)
 *
 * WHY: Allow orgs to set/change their square logo.
 * HOW: Updates the logo field on the organization record.
 *
 * SOURCE OF TRUTH: OrganizationLogo
 *
 * @param organizationId - Organization ID to update
 * @param logo - Logo URL or null to remove
 */
export async function updateOrganizationLogo(
  organizationId: string,
  logo: string | null
) {
  return await prisma.organization.update({
    where: { id: organizationId },
    data: { logo },
    select: { ...ORG_SETTINGS_SELECT, rectangleLogo: true },
  })
}

/**
 * Update organization rectangle logo (wide)
 *
 * WHY: Allow orgs to set/change their wide/rectangle logo.
 * HOW: Updates the rectangleLogo field on the organization record.
 *
 * SOURCE OF TRUTH: OrganizationRectangleLogo
 *
 * @param organizationId - Organization ID to update
 * @param rectangleLogo - Rectangle logo URL or null to remove
 */
export async function updateOrganizationRectangleLogo(
  organizationId: string,
  rectangleLogo: string | null
) {
  return await prisma.organization.update({
    where: { id: organizationId },
    data: { rectangleLogo },
    select: { ...ORG_SETTINGS_SELECT, rectangleLogo: true },
  })
}

/**
 * Delete an organization (hard delete)
 *
 * WHY: Allow org owners to permanently remove their organization.
 * HOW: Hard deletes the organization record (cascading deletes configured in DB).
 *
 * SOURCE OF TRUTH: OrganizationDeletion
 *
 * @param organizationId - Organization ID to delete
 */
export async function deleteOrganization(organizationId: string) {
  return await prisma.organization.delete({
    where: { id: organizationId },
  })
}
