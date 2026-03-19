/**
 * ============================================================================
 * MOCHI AI TOOLS - LEADS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for lead/contact management.
 *
 * SECURITY: All operations route through the tRPC caller instead of calling
 * service functions directly. This ensures every call passes through the
 * full middleware chain — permissions, feature gates, Stripe connect checks.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiLeadTools, AILeadManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/** All lead operations go through the tRPC caller for security. */

/**
 * Creates all lead-related tools bound to the given organization.
 * Each tool calls the tRPC caller with organizationId pre-bound,
 * enforcing permissions and feature gates on every operation.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation
 */
export function createLeadTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new lead/contact in the CRM.
     * Routes through caller.leads.create() which enforces:
     * - LEADS_CREATE permission
     * - leads.limit feature gate
     * - Duplicate email check
     */
    createLead: tool({
      description: 'Create a new lead/contact in the CRM',
      inputSchema: z.object({
        firstName: z.string().describe('First name of the lead'),
        lastName: z.string().describe('Last name of the lead'),
        email: z.string().email().describe('Email address'),
        phone: z.string().optional().describe('Phone number'),
        status: z
          .enum(['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE'])
          .optional()
          .describe('Lead status (defaults to LEAD if not provided)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC create procedure expects organizationId + lead data */
          const lead = await caller.leads.create({
            organizationId,
            firstName: params.firstName,
            lastName: params.lastName,
            email: params.email,
            phone: params.phone,
            status: params.status ?? 'LEAD',
          })
          return {
            success: true,
            leadId: lead.id,
            name: `${lead.firstName} ${lead.lastName}`,
            email: lead.email,
            message: `Created lead "${lead.firstName} ${lead.lastName}" (ID: ${lead.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createLead', err)
        }
      },
    }),

    /**
     * List leads with optional filtering and pagination.
     * Routes through caller.leads.list() which enforces LEADS_READ permission.
     */
    listLeads: tool({
      description: 'List leads with optional search, status filter, and pagination.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search by name or email'),
        status: z
          .array(z.enum(['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE']))
          .optional()
          .describe('Filter by status'),
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z.number().optional().describe('Items per page (defaults to 10)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC list procedure expects organizationId + filter/pagination params */
          const result = await caller.leads.list({
            organizationId,
            search: params.search,
            status: params.status,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 10,
          })
          return {
            success: true,
            leads: result.leads.map((l) => ({
              id: l.id,
              firstName: l.firstName,
              lastName: l.lastName,
              email: l.email,
              status: l.status,
            })),
            total: result.total,
            message: `Found ${result.total} leads`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listLeads', err)
        }
      },
    }),

    /**
     * Get a single lead by ID with full details.
     * Routes through caller.leads.getById() which enforces LEADS_READ permission.
     */
    getLead: tool({
      description: 'Get a lead by ID with full details including tags.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to fetch'),
      }),
      execute: async (params) => {
        try {
          /** tRPC getById expects { organizationId, leadId } */
          const lead = await caller.leads.getById({
            organizationId,
            leadId: params.leadId,
          })
          return {
            success: true,
            lead: {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              email: lead.email,
              phone: lead.phone,
              status: lead.status,
              tags: lead.tags,
            },
            message: `Found lead "${lead.firstName} ${lead.lastName}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getLead', err)
        }
      },
    }),

    /**
     * Update a lead's details.
     * Routes through caller.leads.update() which enforces:
     * - LEADS_UPDATE permission
     * - Lead existence check
     * - Duplicate email check (if email changed)
     */
    updateLead: tool({
      description: 'Update a lead by ID. Only provide the fields you want to change.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to update'),
        firstName: z.string().optional().describe('New first name'),
        lastName: z.string().optional().describe('New last name'),
        email: z.string().email().optional().describe('New email'),
        phone: z.string().optional().describe('New phone'),
        status: z
          .enum(['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE'])
          .optional()
          .describe('New status'),
      }),
      execute: async (params) => {
        try {
          const { leadId, ...data } = params
          /** tRPC update expects { organizationId, leadId, ...fields } */
          const lead = await caller.leads.update({
            organizationId,
            leadId,
            ...data,
          })
          return {
            success: true,
            leadId: lead.id,
            message: `Updated lead "${lead.firstName} ${lead.lastName}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateLead', err)
        }
      },
    }),

    /**
     * Delete a lead permanently — ALWAYS confirm with askUser first.
     * Routes through caller.leads.delete() which enforces:
     * - LEADS_DELETE permission
     * - Lead existence check
     * - leads.limit usage decrement
     */
    deleteLead: tool({
      description:
        'Permanently delete a lead and all their associated data. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to delete'),
      }),
      execute: async (params) => {
        try {
          /** tRPC delete expects { organizationId, leadId } */
          await caller.leads.delete({
            organizationId,
            leadId: params.leadId,
          })
          return {
            success: true,
            leadId: params.leadId,
            message: 'Deleted lead',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteLead', err)
        }
      },
    }),

    /**
     * Count leads with optional status filter.
     * Routes through caller.leads.count() which enforces LEADS_READ permission.
     */
    countLeads: tool({
      description: 'Count total leads, optionally filtered by a single status.',
      inputSchema: z.object({
        status: z
          .enum(['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE'])
          .optional()
          .describe('Filter by status'),
      }),
      execute: async (params) => {
        try {
          /** tRPC count expects { organizationId, status? } */
          const count = await caller.leads.count({
            organizationId,
            status: params.status,
          })
          return {
            success: true,
            count,
            message: `${count} leads`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('countLeads', err)
        }
      },
    }),
  }
}
