/**
 * Leads Service (DAL)
 *
 * Data Access Layer for all lead operations.
 * This is the ONLY place that should interact with Prisma for leads.
 *
 * tRPC routers call these functions after security checks.
 * Trigger tools must call tRPC endpoints (not this service directly).
 */

import { prisma } from '@/lib/config'
import { LeadStatus, Prisma } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'
import type {
  LeadActivityItem,
  LeadActivityResponse,
} from '@/app/(main)/(protected)/(dashboard-layout)/leads/_components/activity/types'
import { stripHtml, truncateText } from '@/lib/utils/lead-helpers'

// ============================================================================
// TYPES
// ============================================================================

export type LeadCreateInput = {
  organizationId: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  location?: string
  locationCode?: string
  source?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zipCode?: string | null
  country?: string | null
  status?: LeadStatus
  assignedToId?: string | null
}

export type LeadUpdateInput = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string | null
  location?: string
  locationCode?: string
  source?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zipCode?: string | null
  country?: string | null
  cltv?: number
  status?: LeadStatus
  assignedToId?: string | null
}

export type LeadListParams = {
  organizationId: string
  search?: string
  status?: LeadStatus[]
  tags?: string[]
  page?: number
  pageSize?: number
}

export type TagCreateInput = {
  organizationId: string
  name: string
  color?: string
}

export type TagUpdateInput = {
  name?: string
  color?: string
}

// ============================================================================
// LEAD CRUD
// ============================================================================

/**
 * Check if email already exists in organization
 */
export async function checkLeadEmailExists(
  organizationId: string,
  email: string,
  excludeLeadId?: string
): Promise<boolean> {
  const existing = await prisma.lead.findFirst({
    where: {
      organizationId,
      email,
      deletedAt: null,
      ...(excludeLeadId && { id: { not: excludeLeadId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * Create a new lead
 *
 * SECURITY: Validates assignedToId (if provided) belongs to the same
 * organization to prevent cross-tenant member assignment and info disclosure.
 *
 * @param input - Lead creation input data
 * @param userId - Optional userId for activity logging
 */
export async function createLead(input: LeadCreateInput, userId?: string) {
  // SECURITY: If assignedToId is provided, validate the member belongs to this org
  if (input.assignedToId) {
    const member = await prisma.member.findFirst({
      where: {
        id: input.assignedToId,
        organizationId: input.organizationId,
      },
      select: { id: true },
    })

    if (!member) {
      throw new Error('Team member not found in this organization')
    }
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: input.organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      location: input.location || 'Unknown',
      locationCode: input.locationCode || 'XX',
      source: input.source,
      address: input.address,
      address2: input.address2,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      country: input.country,
      status: input.status || LeadStatus.LEAD,
      assignedToId: input.assignedToId,
      lastActivityAt: new Date(),
    },
  })

  // Log activity for lead creation
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'lead',
      entityId: lead.id,
    })
  }

  return lead
}

/**
 * Get a lead by ID
 */
export async function getLeadById(organizationId: string, leadId: string) {
  return await prisma.lead.findFirst({
    where: {
      id: leadId,
      organizationId,
      deletedAt: null,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  })
}

/**
 * Get a lead by email
 */
export async function getLeadByEmail(organizationId: string, email: string) {
  return await prisma.lead.findFirst({
    where: {
      organizationId,
      email,
      deletedAt: null,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  })
}

/**
 * Update a lead - organizationId in WHERE prevents cross-org access
 *
 * SECURITY: Validates assignedToId (if being updated) belongs to the same
 * organization to prevent cross-tenant member assignment.
 *
 * @param organizationId - Organization the lead belongs to
 * @param leadId - ID of the lead to update
 * @param data - Updated lead data
 * @param userId - Optional userId for activity logging
 */
export async function updateLead(
  organizationId: string,
  leadId: string,
  data: LeadUpdateInput,
  userId?: string
) {
  // SECURITY: If assignedToId is being updated, validate member belongs to this org
  if (data.assignedToId !== undefined && data.assignedToId !== null) {
    const member = await prisma.member.findFirst({
      where: {
        id: data.assignedToId,
        organizationId,
      },
      select: { id: true },
    })

    if (!member) {
      throw new Error('Team member not found in this organization')
    }
  }

  const updatedLead = await prisma.lead.update({
    where: {
      id: leadId,
      organizationId,
    },
    data: {
      ...data,
      lastActivityAt: new Date(),
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  })

  // Log activity for lead update
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'lead',
      entityId: updatedLead.id,
    })
  }

  return updatedLead
}

/**
 * Hard delete a lead - organizationId in WHERE prevents cross-org access
 *
 * SECURITY: Uses hard delete per project standards. The organizationId check
 * ensures users can only delete leads within their organization.
 *
 * @param organizationId - Organization the lead belongs to
 * @param leadId - ID of the lead to delete
 * @param userId - Optional userId for activity logging
 */
export async function deleteLead(organizationId: string, leadId: string, userId?: string) {
  await prisma.lead.delete({
    where: {
      id: leadId,
      organizationId,
    },
  })

  // Log activity for lead deletion
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'lead',
      entityId: leadId,
    })
  }

  return { success: true }
}

/**
 * Bulk hard delete leads
 *
 * SECURITY: Uses hard delete per project standards. The organizationId check
 * ensures users can only delete leads within their organization.
 *
 * @param organizationId - Organization the leads belong to
 * @param leadIds - IDs of the leads to delete
 * @param userId - Optional userId for activity logging
 */
export async function bulkDeleteLeads(organizationId: string, leadIds: string[], userId?: string) {
  const result = await prisma.lead.deleteMany({
    where: {
      id: { in: leadIds },
      organizationId,
    },
  })

  // Log activities for bulk lead deletion
  if (userId && leadIds.length > 0) {
    logActivities(
      leadIds.map((leadId) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'lead',
        entityId: leadId,
      }))
    )
  }

  return result
}

/**
 * List leads with pagination and filters
 */
export async function listLeads(params: LeadListParams) {
  const {
    organizationId,
    search,
    status,
    tags,
    page = 1,
    pageSize = 10,
  } = params

  // Build where clause
  const where: Prisma.LeadWhereInput = {
    organizationId,
    deletedAt: null,
  }

  // Search filter
  if (search && search.trim()) {
    const searchLower = search.toLowerCase().trim()
    where.OR = [
      { firstName: { contains: searchLower, mode: 'insensitive' } },
      { lastName: { contains: searchLower, mode: 'insensitive' } },
      { email: { contains: searchLower, mode: 'insensitive' } },
      { phone: { contains: searchLower, mode: 'insensitive' } },
      { location: { contains: searchLower, mode: 'insensitive' } },
    ]
  }

  // Status filter
  if (status && status.length > 0) {
    where.status = { in: status }
  }

  // Tags filter
  if (tags && tags.length > 0) {
    where.tags = {
      some: {
        tag: {
          name: { in: tags },
          deletedAt: null,
        },
      },
    }
  }

  // Get total count
  const total = await prisma.lead.count({ where })

  // Get paginated leads
  const leads = await prisma.lead.findMany({
    where,
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Count leads with optional filters
 */
export async function countLeads(
  organizationId: string,
  filters?: { status?: LeadStatus; tags?: string[]; search?: string }
) {
  const where: Prisma.LeadWhereInput = {
    organizationId,
    deletedAt: null,
  }

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.tags && filters.tags.length > 0) {
    where.tags = {
      some: {
        tag: {
          name: { in: filters.tags },
          deletedAt: null,
        },
      },
    }
  }

  if (filters?.search && filters.search.trim()) {
    const searchLower = filters.search.toLowerCase().trim()
    where.OR = [
      { firstName: { contains: searchLower, mode: 'insensitive' } },
      { lastName: { contains: searchLower, mode: 'insensitive' } },
      { email: { contains: searchLower, mode: 'insensitive' } },
    ]
  }

  return await prisma.lead.count({ where })
}

/**
 * Get status counts for filters
 */
export async function getLeadStatusCounts(organizationId: string) {
  const counts = await prisma.lead.groupBy({
    by: ['status'],
    where: {
      organizationId,
      deletedAt: null,
    },
    _count: {
      status: true,
    },
  })

  const total = await prisma.lead.count({
    where: {
      organizationId,
      deletedAt: null,
    },
  })

  const statusCounts: Record<string, number> = {
    All: total,
    LEAD: 0,
    PROSPECT: 0,
    ACTIVE: 0,
    INACTIVE: 0,
  }

  for (const count of counts) {
    statusCounts[count.status] = count._count.status
  }

  return statusCounts
}

/**
 * Get assigned member info for leads
 */
export async function getAssignedMembers(memberIds: string[]) {
  if (memberIds.length === 0) return []

  return await prisma.member.findMany({
    where: {
      id: { in: memberIds },
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
}

// ============================================================================
// TAG CRUD
// ============================================================================

/**
 * List all tags for organization
 */
export async function listTags(organizationId: string) {
  return await prisma.leadTag.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    orderBy: {
      name: 'asc',
    },
  })
}

/**
 * Get tag by ID
 */
export async function getTagById(organizationId: string, tagId: string) {
  return await prisma.leadTag.findFirst({
    where: {
      id: tagId,
      organizationId,
      deletedAt: null,
    },
  })
}

/**
 * Get tag by name
 */
export async function getTagByName(organizationId: string, name: string) {
  return await prisma.leadTag.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
    },
  })
}

/**
 * Check if tag name exists
 */
export async function checkTagNameExists(
  organizationId: string,
  name: string,
  excludeTagId?: string
): Promise<boolean> {
  const existing = await prisma.leadTag.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeTagId && { id: { not: excludeTagId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * Create a new tag
 *
 * @param input - Tag creation input data
 * @param userId - Optional userId for activity logging
 */
export async function createTag(input: TagCreateInput, userId?: string) {
  const tag = await prisma.leadTag.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      color: input.color || '#3b82f6',
    },
  })

  // Log activity for tag creation (using 'lead' entity since tags are part of leads feature)
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'lead',
      entityId: tag.id,
    })
  }

  return tag
}

/**
 * Create or get tag by name (upsert)
 */
export async function upsertTag(organizationId: string, name: string, color?: string) {
  return await prisma.leadTag.upsert({
    where: {
      organizationId_name: { organizationId, name },
    },
    create: {
      organizationId,
      name,
      color: color || '#3b82f6',
    },
    update: {},
  })
}

/**
 * Update a tag
 *
 * SECURITY: organizationId in WHERE clause ensures users can only update
 * tags within their organization (defense-in-depth against IDOR).
 *
 * @param organizationId - Organization the tag belongs to
 * @param tagId - ID of the tag to update
 * @param data - Updated tag data
 * @param userId - Optional userId for activity logging
 */
export async function updateTag(
  organizationId: string,
  tagId: string,
  data: TagUpdateInput,
  userId?: string
) {
  const tag = await prisma.leadTag.update({
    where: {
      id: tagId,
      organizationId,
    },
    data,
  })

  // Log activity for tag update (using 'lead' entity since tags are part of leads feature)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'lead',
      entityId: tag.id,
    })
  }

  return tag
}

/**
 * Hard delete a tag
 *
 * SECURITY: organizationId in WHERE clause ensures users can only delete
 * tags within their organization (defense-in-depth against IDOR).
 * Uses hard delete per project standards.
 *
 * @param organizationId - Organization the tag belongs to
 * @param tagId - ID of the tag to delete
 * @param userId - Optional userId for activity logging
 */
export async function deleteTag(organizationId: string, tagId: string, userId?: string) {
  await prisma.leadTag.delete({
    where: {
      id: tagId,
      organizationId,
    },
  })

  // Log activity for tag deletion (using 'lead' entity since tags are part of leads feature)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'lead',
      entityId: tagId,
    })
  }

  return { success: true }
}

// ============================================================================
// TAG ASSIGNMENTS
// ============================================================================

/**
 * Check if tag is already assigned to lead
 */
export async function isTagAssignedToLead(leadId: string, tagId: string): Promise<boolean> {
  const existing = await prisma.leadTagAssignment.findUnique({
    where: {
      leadId_tagId: { leadId, tagId },
    },
  })
  return !!existing
}

/**
 * Add tag to lead
 *
 * SECURITY: Requires organizationId to validate both the lead and tag
 * belong to the same organization, preventing cross-tenant tag injection.
 */
export async function addTagToLead(
  organizationId: string,
  leadId: string,
  tagId: string
) {
  // SECURITY: Validate lead belongs to this organization
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    select: { id: true },
  })

  if (!lead) {
    throw new Error('Lead not found or not accessible')
  }

  // SECURITY: Validate tag belongs to this organization
  const tag = await prisma.leadTag.findFirst({
    where: { id: tagId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  })

  if (!tag) {
    throw new Error('Tag not found or not accessible')
  }

  await prisma.leadTagAssignment.create({
    data: {
      leadId,
      tagId,
    },
  })

  // Update lead activity
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastActivityAt: new Date() },
  })

}

/**
 * Remove tag from lead
 *
 * SECURITY: Requires organizationId to validate both the lead and tag
 * belong to the same organization, preventing unauthorized tag removal.
 */
export async function removeTagFromLead(
  organizationId: string,
  leadId: string,
  tagId: string
) {
  // SECURITY: Validate lead belongs to this organization
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    select: { id: true },
  })

  if (!lead) {
    throw new Error('Lead not found or not accessible')
  }

  // SECURITY: Validate tag belongs to this organization
  const tag = await prisma.leadTag.findFirst({
    where: { id: tagId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  })

  if (!tag) {
    throw new Error('Tag not found or not accessible')
  }

  await prisma.leadTagAssignment.deleteMany({
    where: {
      leadId,
      tagId,
    },
  })

  // Update lead activity
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastActivityAt: new Date() },
  })

}

/**
 * Add multiple tags to lead (by tag names, creating if needed)
 */
export async function addTagsToLeadByName(
  organizationId: string,
  leadId: string,
  tagNames: string[]
) {
  const results: Array<{ id: string; name: string; color: string }> = []

  for (const tagName of tagNames) {
    const normalizedName = tagName.trim()
    if (!normalizedName) continue

    // Upsert the tag
    const tag = await upsertTag(organizationId, normalizedName)

    // Check if already assigned
    const isAssigned = await isTagAssignedToLead(leadId, tag.id)
    if (!isAssigned) {
      await prisma.leadTagAssignment.create({
        data: { leadId, tagId: tag.id },
      })
    }

    results.push({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })
  }

  // Update lead activity
  if (results.length > 0) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastActivityAt: new Date() },
    })
  }

  return results
}

/**
 * Remove multiple tags from lead (by tag names)
 */
export async function removeTagsFromLeadByName(
  organizationId: string,
  leadId: string,
  tagNames: string[]
) {
  const removedTags: string[] = []

  for (const tagName of tagNames) {
    const normalizedName = tagName.trim()
    if (!normalizedName) continue

    const tag = await getTagByName(organizationId, normalizedName)
    if (tag) {
      await prisma.leadTagAssignment.deleteMany({
        where: { leadId, tagId: tag.id },
      })
      removedTags.push(normalizedName)
    }
  }

  // Update lead activity
  if (removedTags.length > 0) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastActivityAt: new Date() },
    })
  }

  return removedTags
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Transform lead to API response format
 */
export function transformLead(lead: Prisma.LeadGetPayload<{
  include: { tags: { include: { tag: true } } }
}>) {
  return {
    id: lead.id,
    organizationId: lead.organizationId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown',
    email: lead.email,
    phone: lead.phone,
    avatarUrl: lead.avatarUrl,
    location: lead.location,
    locationCode: lead.locationCode,
    source: lead.source,
    address: lead.address,
    address2: lead.address2,
    city: lead.city,
    state: lead.state,
    zipCode: lead.zipCode,
    country: lead.country,
    cltv: lead.cltv,
    status: lead.status,
    assignedToId: lead.assignedToId,
    tags: lead.tags.map(ta => ({
      id: ta.tag.id,
      name: ta.tag.name,
      color: ta.tag.color,
    })),
    lastActivityAt: lead.lastActivityAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  }
}

/**
 * Transform tag to API response format
 */
export function transformTag(tag: { id: string; name: string; color: string }) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
  }
}

// ============================================================================
// WEBHOOK HELPERS
// ============================================================================

/**
 * Look up a lead's display name by ID.
 *
 * WHY: Used in webhook handlers to resolve customer names for payment notifications.
 * Test mode payments store leadId in Stripe metadata — this resolves that to a name.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadNameLookup, WebhookLeadResolve
 *
 * @param leadId - The lead ID to look up
 * @returns The lead's first and last name, or null if not found
 */
export async function getLeadNameById(leadId: string) {
  return await prisma.lead.findUnique({
    where: { id: leadId },
    select: { firstName: true, lastName: true },
  })
}

// ============================================================================
// AUTOMATION HELPERS
// ============================================================================
// These functions are used by automation execution tasks.
// They do NOT trigger new automations to prevent infinite loops.

/**
 * Add tag to lead for automation execution.
 * WHY: Automations need to add tags without triggering more automations.
 *
 * @param leadId - The lead to tag
 * @param tagId - The tag to add
 * @returns Result with added flag or skipped reason
 */
export async function addTagToLeadForAutomation(
  leadId: string,
  tagId: string
): Promise<{ added: boolean; skipped?: boolean; reason?: string }> {
  // Check if already assigned
  const existing = await prisma.leadTagAssignment.findUnique({
    where: { leadId_tagId: { leadId, tagId } },
  })

  if (existing) {
    return { added: false, skipped: true, reason: 'Tag already assigned' }
  }

  // Create assignment
  await prisma.leadTagAssignment.create({
    data: { leadId, tagId },
  })

  // Update lead activity
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastActivityAt: new Date() },
  })

  return { added: true }
}

/**
 * Remove tag from lead for automation execution.
 * WHY: Automations need to remove tags without triggering more automations.
 *
 * @param leadId - The lead to untag
 * @param tagId - The tag to remove
 * @returns Result with removed flag or skipped reason
 */
export async function removeTagFromLeadForAutomation(
  leadId: string,
  tagId: string
): Promise<{ removed: boolean; skipped?: boolean; reason?: string }> {
  // Check if assigned
  const existing = await prisma.leadTagAssignment.findUnique({
    where: { leadId_tagId: { leadId, tagId } },
  })

  if (!existing) {
    return { removed: false, skipped: true, reason: 'Tag not assigned to lead' }
  }

  // Delete assignment
  await prisma.leadTagAssignment.delete({
    where: { leadId_tagId: { leadId, tagId } },
  })

  // Update lead activity
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastActivityAt: new Date() },
  })

  return { removed: true }
}

// ============================================================================
// CONTEXT BUILDER HELPERS (Variable Interpolation)
// ============================================================================
// Used by context-builder.ts to fetch lead data for template variable interpolation.
// SOURCE OF TRUTH KEYWORDS: LeadWithRelationsForContext, FetchLeadForVariables

/**
 * Fetch a lead with tags and transactions for variable context building.
 *
 * WHY: The variable context builder needs lead data enriched with tags and
 * recent transactions for template interpolation (e.g., {{lead.tags}}, {{lead.transaction.amount}}).
 *
 * SOURCE OF TRUTH: LeadWithRelationsForContext, VariableContextLeadFetch
 *
 * @param leadId - The lead ID to fetch
 * @param organizationId - Organization scope for security
 * @param options - Control how many transactions to include
 * @returns Lead with tags and transactions, or null if not found
 */
export async function getLeadWithRelationsForContext(
  leadId: string,
  organizationId: string,
  options: { includeAllTransactions?: boolean }
) {
  return await prisma.lead.findFirst({
    where: {
      id: leadId,
      organizationId,
      deletedAt: null,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: options.includeAllTransactions ? undefined : 5,
      },
    },
  })
}

/**
 * Find a lead by email within an organization (minimal select for ID lookup).
 *
 * WHY: The appointment-started scheduler needs to find a lead by booker email
 * to associate the automation trigger with the correct lead.
 *
 * SOURCE OF TRUTH: FindLeadByEmailMinimal, AppointmentLeadLookup
 *
 * @param organizationId - Organization scope for security
 * @param email - Email address to look up
 * @returns Lead ID or null if not found
 */
export async function findLeadIdByEmail(
  organizationId: string,
  email: string
): Promise<{ id: string } | null> {
  return await prisma.lead.findFirst({
    where: {
      organizationId,
      email,
    },
    select: { id: true },
  })
}

// ============================================================================
// LEAD ACTIVITY TIMELINE
// ============================================================================

/** Max characters for message body preview in activity items */
const ACTIVITY_BODY_PREVIEW_LENGTH = 120

/**
 * Get paginated activity timeline for a lead.
 *
 * WHY: Aggregates data from 10 related models into a single chronological feed
 * for the Activity tab in the Lead Viewer. Queries only existing data — no new
 * tables or tracking required.
 *
 * HOW:
 * 1. Validates lead exists and belongs to organization
 * 2. Runs 10 parallel Prisma queries (one per source model) via Promise.all
 * 3. Transforms each query result into LeadActivityItem[] shape
 * 4. Merges all items, sorts by timestamp descending
 * 5. Applies page-based slicing and returns paginated response
 *
 * PERFORMANCE:
 * - Each query hits an indexed `leadId` column (fast lookups)
 * - All queries run in parallel (single round-trip time, not sequential)
 * - Only selects fields needed for display (minimal data transfer)
 * - Page-based pagination (not cursor) because items come from heterogeneous tables
 *
 * SECURITY: organizationId validated via lead ownership check before any queries.
 *
 * SOURCE OF TRUTH KEYWORDS: GetLeadActivity, LeadActivityTimeline, ActivityAggregation
 *
 * @param organizationId - Organization the lead belongs to (defense-in-depth validation)
 * @param leadId - The lead whose activity to fetch
 * @param page - Page number (1-indexed), defaults to 1
 * @param pageSize - Items per page, defaults to 20
 */
export async function getLeadActivity(
  organizationId: string,
  leadId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<LeadActivityResponse> {
  // Verify lead exists and belongs to this organization
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true, createdAt: true },
  })

  if (!lead) {
    return { items: [], page, pageSize, hasMore: false, totalEstimate: 0 }
  }

  // Run all queries in parallel — each hits an indexed leadId column
  const [
    formSubmissions,
    transactions,
    calendarEvents,
    messages,
    contracts,
    invoices,
    pipelineTickets,
    tagAssignments,
    sessions,
    pageViews,
  ] = await Promise.all([
    // Form submissions linked to this lead
    prisma.formSubmission.findMany({
      where: { leadId },
      select: {
        id: true,
        createdAt: true,
        form: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Transactions (payments) linked to this lead
    prisma.transaction.findMany({
      where: { leadId },
      select: {
        id: true,
        originalAmount: true,
        currency: true,
        paymentStatus: true,
        billingType: true,
        firstPaidAt: true,
        createdAt: true,
        items: {
          select: { productName: true },
          take: 2, // Only need first item name + count
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Calendar events (appointments) linked to this lead
    prisma.calendarEvent.findMany({
      where: { leadId },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        location: true,
        meetingUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Messages via Conversation — Messages don't have direct leadId,
    // they link through Conversation.leadId
    prisma.message.findMany({
      where: {
        conversation: { leadId, deletedAt: null },
        deletedAt: null,
      },
      select: {
        id: true,
        channel: true,
        direction: true,
        subject: true,
        body: true,
        bodyHtml: true,
        sentAt: true,
      },
      orderBy: { sentAt: 'desc' },
    }),

    // Contracts sent to this lead — Contract uses recipientId, not leadId.
    // Filter out templates (only show actual contract instances).
    prisma.contract.findMany({
      where: { recipientId: leadId, isTemplate: false },
      select: {
        id: true,
        name: true,
        status: true,
        sentAt: true,
        signedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Invoices sent to this lead
    prisma.invoice.findMany({
      where: { leadId },
      select: {
        id: true,
        invoiceNumber: true,
        name: true,
        status: true,
        totalAmount: true,
        currency: true,
        sentAt: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Pipeline tickets linked to this lead
    prisma.pipelineTicket.findMany({
      where: { leadId, deletedAt: null },
      select: {
        id: true,
        title: true,
        value: true,
        createdAt: true,
        lane: {
          select: {
            name: true,
            pipeline: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Tag assignments on this lead
    prisma.leadTagAssignment.findMany({
      where: { leadId },
      select: {
        id: true,
        createdAt: true,
        tag: { select: { name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Lead sessions (visitor identification events)
    prisma.leadSession.findMany({
      where: { leadId },
      select: {
        id: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),

    // Page views — tracks which published pages the lead visited
    prisma.pageView.findMany({
      where: {
        leadId,
        organizationId,
      },
      select: {
        id: true,
        pathname: true,
        utmSource: true,
        visitedAt: true,
        page: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { visitedAt: 'desc' },
    }),
  ])

  // ---- Transform each result set into LeadActivityItem[] ----

  // Lead creation event (always exactly one)
  const leadCreatedItem: LeadActivityItem = {
    id: `lead_${lead.id}`,
    type: 'LEAD_CREATED',
    timestamp: lead.createdAt.toISOString(),
  }

  // Form submissions
  const formActivities: LeadActivityItem[] = formSubmissions.map((fs) => ({
    id: `form_${fs.id}`,
    type: 'FORM_SUBMITTED' as const,
    timestamp: fs.createdAt.toISOString(),
    formName: fs.form.name,
    formId: fs.form.id,
  }))

  // Transactions (payments) — use firstPaidAt as timestamp if available, otherwise createdAt
  const paymentActivities: LeadActivityItem[] = transactions.map((tx) => {
    // Get total item count via a count query would be expensive — use items length hint
    // We fetch up to 2 items; if there are 2, there might be more
    const productSummary =
      tx.items.length === 0
        ? 'Payment'
        : tx.items.length === 1
          ? tx.items[0].productName
          : `${tx.items[0].productName} + more`

    return {
      id: `tx_${tx.id}`,
      type: 'PAYMENT_MADE' as const,
      timestamp: (tx.firstPaidAt || tx.createdAt).toISOString(),
      amount: tx.originalAmount,
      currency: tx.currency,
      paymentStatus: tx.paymentStatus,
      billingType: tx.billingType,
      productSummary,
      itemCount: tx.items.length,
    }
  })

  // Calendar events (appointments)
  const appointmentActivities: LeadActivityItem[] = calendarEvents.map((ce) => ({
    id: `cal_${ce.id}`,
    type: 'APPOINTMENT_BOOKED' as const,
    timestamp: ce.createdAt.toISOString(),
    title: ce.title,
    status: ce.status,
    startDate: ce.startDate.toISOString(),
    endDate: ce.endDate.toISOString(),
    location: ce.location,
    meetingUrl: ce.meetingUrl,
  }))

  // Messages — split into SENT (outbound) and RECEIVED (inbound)
  const messageActivities: LeadActivityItem[] = messages.map((msg) => {
    // Create a plain text preview: prefer bodyHtml stripped, fall back to body
    const rawText = msg.bodyHtml ? stripHtml(msg.bodyHtml) : msg.body
    const bodyPreview = truncateText(rawText, ACTIVITY_BODY_PREVIEW_LENGTH)

    if (msg.direction === 'OUTBOUND') {
      return {
        id: `msg_${msg.id}`,
        type: 'MESSAGE_SENT' as const,
        timestamp: msg.sentAt.toISOString(),
        channel: msg.channel,
        subject: msg.subject,
        bodyPreview,
      }
    }

    return {
      id: `msg_${msg.id}`,
      type: 'MESSAGE_RECEIVED' as const,
      timestamp: msg.sentAt.toISOString(),
      channel: msg.channel,
      subject: msg.subject,
      bodyPreview,
    }
  })

  // Contracts — can produce 2 events per record (sent + signed)
  const contractActivities: LeadActivityItem[] = contracts.flatMap((c) => {
    const items: LeadActivityItem[] = []

    // CONTRACT_SENT event (when sentAt is set)
    if (c.sentAt) {
      items.push({
        id: `contract_sent_${c.id}`,
        type: 'CONTRACT_SENT' as const,
        timestamp: c.sentAt.toISOString(),
        contractName: c.name,
        contractId: c.id,
        status: c.status,
      })
    }

    // CONTRACT_SIGNED event (when signedAt is set)
    if (c.signedAt) {
      items.push({
        id: `contract_signed_${c.id}`,
        type: 'CONTRACT_SIGNED' as const,
        timestamp: c.signedAt.toISOString(),
        contractName: c.name,
        contractId: c.id,
      })
    }

    return items
  })

  // Invoices — can produce 2 events per record (sent + paid)
  const invoiceActivities: LeadActivityItem[] = invoices.flatMap((inv) => {
    const items: LeadActivityItem[] = []

    // INVOICE_SENT event (when sentAt is set)
    if (inv.sentAt) {
      items.push({
        id: `invoice_sent_${inv.id}`,
        type: 'INVOICE_SENT' as const,
        timestamp: inv.sentAt.toISOString(),
        invoiceName: inv.name,
        invoiceNumber: inv.invoiceNumber,
        invoiceId: inv.id,
        totalAmount: inv.totalAmount,
        currency: inv.currency,
        status: inv.status,
      })
    }

    // INVOICE_PAID event (when paidAt is set)
    if (inv.paidAt) {
      items.push({
        id: `invoice_paid_${inv.id}`,
        type: 'INVOICE_PAID' as const,
        timestamp: inv.paidAt.toISOString(),
        invoiceName: inv.name,
        invoiceNumber: inv.invoiceNumber,
        invoiceId: inv.id,
        totalAmount: inv.totalAmount,
        currency: inv.currency,
      })
    }

    return items
  })

  // Pipeline tickets
  const pipelineActivities: LeadActivityItem[] = pipelineTickets.map((pt) => ({
    id: `ticket_${pt.id}`,
    type: 'PIPELINE_TICKET_CREATED' as const,
    timestamp: pt.createdAt.toISOString(),
    ticketTitle: pt.title,
    laneName: pt.lane.name,
    pipelineName: pt.lane.pipeline.name,
    value: pt.value,
  }))

  // Tag assignments
  const tagActivities: LeadActivityItem[] = tagAssignments.map((ta) => ({
    id: `tag_${ta.id}`,
    type: 'TAG_ADDED' as const,
    timestamp: ta.createdAt.toISOString(),
    tagName: ta.tag.name,
    tagColor: ta.tag.color,
  }))

  // Lead sessions (visitor identification)
  const sessionActivities: LeadActivityItem[] = sessions.map((s) => ({
    id: `session_${s.id}`,
    type: 'SESSION_STARTED' as const,
    timestamp: s.createdAt.toISOString(),
    source: s.source,
  }))

  // Page views — each visit to a published page becomes a timeline entry
  const pageViewActivities: LeadActivityItem[] = pageViews.map((pv) => ({
    id: `pageview_${pv.id}`,
    type: 'PAGE_VISITED' as const,
    timestamp: pv.visitedAt.toISOString(),
    pathname: pv.pathname,
    pageName: pv.page?.name ?? 'Unknown page',
    utmSource: pv.utmSource,
  }))

  // ---- Merge all activity arrays and sort by timestamp descending (newest first) ----
  const allActivities: LeadActivityItem[] = [
    leadCreatedItem,
    ...formActivities,
    ...paymentActivities,
    ...appointmentActivities,
    ...messageActivities,
    ...contractActivities,
    ...invoiceActivities,
    ...pipelineActivities,
    ...tagActivities,
    ...sessionActivities,
    ...pageViewActivities,
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // ---- Paginate ----
  const startIndex = (page - 1) * pageSize
  const paginatedItems = allActivities.slice(startIndex, startIndex + pageSize)
  const hasMore = startIndex + pageSize < allActivities.length

  return {
    items: paginatedItems,
    page,
    pageSize,
    hasMore,
    totalEstimate: allActivities.length,
  }
}

