/**
 * Leads Router
 *
 * tRPC router for leads/contacts management.
 * Uses organizationProcedure for authorization.
 * All data access goes through leads.service.ts (DAL).
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { LeadStatus } from '@/generated/prisma'
import * as leadsService from '@/services/leads.service'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS - Exported for use by AI tools (single source of truth)
// ============================================================================

export const createLeadSchema = z.object({
  organizationId: z.string(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional().nullable(),
  location: z.string().optional().default('Unknown'),
  locationCode: z.string().optional().default('XX'),
  source: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  address2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  status: z.nativeEnum(LeadStatus).optional().default(LeadStatus.LEAD),
  assignedToId: z.string().optional().nullable(),
})

export const updateLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  location: z.string().optional(),
  locationCode: z.string().optional(),
  source: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  address2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  cltv: z.number().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  assignedToId: z.string().optional().nullable(),
})

export const listLeadsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  status: z.array(z.nativeEnum(LeadStatus)).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10),
})

export const getLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
})

export const deleteLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
})

export const createTagSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Tag name is required'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').default('#3b82f6'),
})

export const addTagToLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  tagId: z.string(),
})

export const removeTagFromLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  tagId: z.string(),
})

export const listTagsSchema = z.object({
  organizationId: z.string(),
})

/**
 * Schema for fetching a lead's activity timeline with cursor-based pagination.
 * WHY: Cursor-based pagination enables useInfiniteQuery on the frontend for
 * infinite scroll instead of manual "Load more" button. The cursor represents
 * the page number (1-indexed); null/undefined = first page.
 * SOURCE OF TRUTH KEYWORDS: GetLeadActivitySchema, LeadActivityInput
 */
export const getLeadActivitySchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  cursor: z.number().min(1).nullish(),
  limit: z.number().min(1).max(50).default(20),
})

// ============================================================================
// ROUTER
// ============================================================================

export const leadsRouter = createTRPCRouter({
  /**
   * List leads with pagination and filters
   */
  list: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(listLeadsSchema)
    .query(async ({ input }) => {
      const { organizationId, search, status, page, pageSize } = input

      const result = await leadsService.listLeads({
        organizationId,
        search,
        status,
        page,
        pageSize,
      })

      // Get assigned members info
      const assignedMemberIds = result.leads
        .filter(lead => lead.assignedToId)
        .map(lead => lead.assignedToId!)

      const members = await leadsService.getAssignedMembers(assignedMemberIds)
      const memberMap = new Map(members.map(m => [m.id, m.user]))

      // Transform leads
      const enrichedLeads = result.leads.map(lead => {
        const transformed = leadsService.transformLead(lead)
        const assignedUser = lead.assignedToId ? memberMap.get(lead.assignedToId) : null

        return {
          ...transformed,
          assignedTo: assignedUser ? {
            id: assignedUser.id,
            name: assignedUser.name || 'Unknown',
            email: assignedUser.email,
            image: assignedUser.image,
          } : null,
        }
      })

      return {
        leads: enrichedLeads,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      }
    }),

  /**
   * Get a single lead by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(z.object({
      organizationId: z.string(),
      leadId: z.string(),
    }))
    .query(async ({ input }) => {
      const { organizationId, leadId } = input

      const lead = await leadsService.getLeadById(organizationId, leadId)

      if (!lead) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      const transformed = leadsService.transformLead(lead)

      // Get assigned member info
      let assignedUser = null
      if (lead.assignedToId) {
        const members = await leadsService.getAssignedMembers([lead.assignedToId])
        assignedUser = members[0]?.user || null
      }

      return {
        ...transformed,
        assignedTo: assignedUser ? {
          id: assignedUser.id,
          name: assignedUser.name || 'Unknown',
          email: assignedUser.email,
          image: assignedUser.image,
        } : null,
      }
    }),

  /**
   * Create a new lead
   *
   * FEATURE GATE: leads.limit
   * Checks organization's lead limit before creating.
   */
  /** Feature-gated: leads.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.LEADS_CREATE,
    requireFeature: 'leads.limit',
  })
    .input(createLeadSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input

      // Check for duplicate email
      const emailExists = await leadsService.checkLeadEmailExists(organizationId, data.email)
      if (emailExists) {
        throw createStructuredError('BAD_REQUEST', 'A lead with this email already exists', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'A lead with this email already exists in your organization',
        })
      }

      const lead = await leadsService.createLead({
        organizationId,
        ...data,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'leads.limit')

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
        assignedTo: null,
        tags: [],
        lastActivityAt: lead.lastActivityAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      }
    }),

  /**
   * Update a lead
   */
  update: organizationProcedure({ requirePermission: permissions.LEADS_UPDATE })
    .input(updateLeadSchema)
    .mutation(async ({ input }) => {
      const { organizationId, leadId, ...data } = input

      // Verify lead exists
      const existing = await leadsService.getLeadById(organizationId, leadId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      // Check for duplicate email if email is being changed
      if (data.email && data.email !== existing.email) {
        const emailExists = await leadsService.checkLeadEmailExists(organizationId, data.email, leadId)
        if (emailExists) {
          throw createStructuredError('BAD_REQUEST', 'A lead with this email already exists', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A lead with this email already exists in your organization',
          })
        }
      }

      const lead = await leadsService.updateLead(organizationId, leadId, data)
      const transformed = leadsService.transformLead(lead)

      // Get assigned member info
      let assignedUser = null
      if (lead.assignedToId) {
        const members = await leadsService.getAssignedMembers([lead.assignedToId])
        assignedUser = members[0]?.user || null
      }

      return {
        ...transformed,
        assignedTo: assignedUser ? {
          id: assignedUser.id,
          name: assignedUser.name || 'Unknown',
          email: assignedUser.email,
          image: assignedUser.image,
        } : null,
      }
    }),

  /**
   * Delete a lead (soft delete)
   *
   * FEATURE GATE: leads.limit
   * Decrements usage after successful deletion.
   */
  delete: organizationProcedure({ requirePermission: permissions.LEADS_DELETE })
    .input(z.object({
      organizationId: z.string(),
      leadId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, leadId } = input

      // Verify lead exists
      const existing = await leadsService.getLeadById(organizationId, leadId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      await leadsService.deleteLead(organizationId, leadId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'leads.limit')

      return { success: true, message: 'Lead deleted' }
    }),

  /**
   * Bulk delete leads (soft delete)
   *
   * FEATURE GATE: leads.limit
   * Decrements usage by the number of deleted leads.
   */
  bulkDelete: organizationProcedure({ requirePermission: permissions.LEADS_DELETE })
    .input(z.object({
      organizationId: z.string(),
      leadIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, leadIds } = input

      const result = await leadsService.bulkDeleteLeads(organizationId, leadIds)

      // Decrement usage by number of deleted leads
      await decrementUsageAndInvalidate(ctx, organizationId, 'leads.limit', result.count)

      return {
        success: true,
        message: `${result.count} leads deleted`,
        count: result.count,
      }
    }),

  /**
   * Get status counts for filters
   */
  getStatusCounts: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await leadsService.getLeadStatusCounts(input.organizationId)
    }),

  // ============================================================================
  // TAGS
  // ============================================================================

  /**
   * List all tags for organization
   */
  listTags: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const tags = await leadsService.listTags(input.organizationId)
      return tags.map(leadsService.transformTag)
    }),

  /**
   * Create a new tag
   */
  createTag: organizationProcedure({ requirePermission: permissions.LEADS_CREATE })
    .input(createTagSchema)
    .mutation(async ({ input }) => {
      const { organizationId, name, color } = input

      // Check for duplicate name
      const nameExists = await leadsService.checkTagNameExists(organizationId, name)
      if (nameExists) {
        throw createStructuredError('BAD_REQUEST', 'A tag with this name already exists', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'A tag with this name already exists',
        })
      }

      const tag = await leadsService.createTag({ organizationId, name, color })

      return leadsService.transformTag(tag)
    }),

  /**
   * Delete a tag
   */
  deleteTag: organizationProcedure({ requirePermission: permissions.LEADS_DELETE })
    .input(z.object({
      organizationId: z.string(),
      tagId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { organizationId, tagId } = input

      // Verify tag exists
      const existing = await leadsService.getTagById(organizationId, tagId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Tag not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Tag not found',
        })
      }

      // SECURITY: Pass organizationId to ensure defense-in-depth org scoping
      await leadsService.deleteTag(organizationId, tagId)

      return { success: true, message: 'Tag deleted' }
    }),

  /**
   * Update a tag
   */
  updateTag: organizationProcedure({ requirePermission: permissions.LEADS_UPDATE })
    .input(z.object({
      organizationId: z.string(),
      tagId: z.string(),
      name: z.string().min(1, 'Tag name is required').optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional(),
    }))
    .mutation(async ({ input }) => {
      const { organizationId, tagId, name, color } = input

      // Verify tag exists
      const existing = await leadsService.getTagById(organizationId, tagId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Tag not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Tag not found',
        })
      }

      // Check for duplicate name if name is being changed
      if (name && name !== existing.name) {
        const nameExists = await leadsService.checkTagNameExists(organizationId, name, tagId)
        if (nameExists) {
          throw createStructuredError('BAD_REQUEST', 'A tag with this name already exists', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A tag with this name already exists',
          })
        }
      }

      // SECURITY: Pass organizationId to ensure defense-in-depth org scoping
      const tag = await leadsService.updateTag(organizationId, tagId, { name, color })

      return leadsService.transformTag(tag)
    }),

  /**
   * Add tag to lead
   */
  addTagToLead: organizationProcedure({ requirePermission: permissions.LEADS_UPDATE })
    .input(addTagToLeadSchema)
    .mutation(async ({ input }) => {
      const { organizationId, leadId, tagId } = input

      // Verify lead exists
      const lead = await leadsService.getLeadById(organizationId, leadId)
      if (!lead) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      // Verify tag exists
      const tag = await leadsService.getTagById(organizationId, tagId)
      if (!tag) {
        throw createStructuredError('NOT_FOUND', 'Tag not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Tag not found',
        })
      }

      // Check if already assigned
      const isAssigned = await leadsService.isTagAssignedToLead(leadId, tagId)
      if (isAssigned) {
        return { success: true, message: 'Tag already assigned' }
      }

      // SECURITY: Pass organizationId to service for defense-in-depth validation
      await leadsService.addTagToLead(organizationId, leadId, tagId)

      return { success: true, message: 'Tag added' }
    }),

  /**
   * Remove tag from lead
   */
  removeTagFromLead: organizationProcedure({ requirePermission: permissions.LEADS_UPDATE })
    .input(removeTagFromLeadSchema)
    .mutation(async ({ input }) => {
      const { organizationId, leadId, tagId } = input

      // Verify lead exists
      const lead = await leadsService.getLeadById(organizationId, leadId)
      if (!lead) {
        throw createStructuredError('NOT_FOUND', 'Lead not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lead not found',
        })
      }

      // SECURITY: Pass organizationId to service for defense-in-depth validation
      await leadsService.removeTagFromLead(organizationId, leadId, tagId)

      return { success: true, message: 'Tag removed' }
    }),

  // ============================================================================
  // ACTIVITY TIMELINE
  // ============================================================================

  /**
   * Get lead activity timeline — aggregates events from all related models.
   *
   * WHY: Powers the Activity tab in LeadViewer with a chronological feed of
   * everything that happened with this lead (form submissions, payments,
   * appointments, messages, contracts, invoices, pipeline events, tags, sessions).
   *
   * HOW: Calls leadsService.getLeadActivity() which queries 10 models in parallel
   * and returns a merged, sorted, paginated result.
   */
  getActivity: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(getLeadActivitySchema)
    .query(async ({ input }) => {
      const { organizationId, leadId, limit } = input
      /** Treat cursor as the page number; default to 1 for the first page */
      const page = input.cursor ?? 1

      const result = await leadsService.getLeadActivity(organizationId, leadId, page, limit)

      return {
        items: result.items,
        /** nextCursor is the next page number, or undefined if no more pages exist */
        nextCursor: result.hasMore ? page + 1 : undefined,
        totalEstimate: result.totalEstimate,
      }
    }),

  // ==========================================================================
  // UTILITY PROCEDURES
  // Used by Mochi AI tools and other internal consumers
  // ==========================================================================

  /**
   * Count leads with optional filters.
   * WHY: Mochi AI uses this to report lead counts to users.
   */
  count: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        status: z.nativeEnum(LeadStatus).optional(),
        tags: z.array(z.string()).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, ...filters } = input
      return await leadsService.countLeads(organizationId, filters)
    }),

  /**
   * Get a lead by email address within an organization.
   * WHY: Mochi AI uses this to resolve a lead from email (e.g., for sending emails).
   */
  getByEmail: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        email: z.string().email(),
      })
    )
    .query(async ({ input }) => {
      return await leadsService.getLeadByEmail(input.organizationId, input.email)
    }),

  /**
   * Get a tag by name (case-insensitive) within an organization.
   * WHY: Mochi AI uses this to check for duplicate tags before creating.
   */
  getTagByName: organizationProcedure({ requirePermission: permissions.LEADS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return await leadsService.getTagByName(input.organizationId, input.name)
    }),
})
