/**
 * ============================================================================
 * MOCHI AI TOOLS - PIPELINES
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for pipeline/kanban management.
 * Pipelines have lanes (columns) and tickets (cards) for deal tracking.
 *
 * SECURITY: Routes all operations through tRPC caller so that permissions,
 * feature gates, and Stripe connect checks are enforced — never bypassed.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiPipelineTools, AIPipelineManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all pipeline-related tools bound to the given organization.
 * Uses the tRPC caller for secure procedure invocation with full middleware.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, and Stripe connect
 */
export function createPipelineTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new pipeline (kanban board).
     * Routes through tRPC `pipeline.create` which enforces:
     * - PIPELINES_CREATE permission
     * - pipelines.limit feature gate
     */
    createPipeline: tool({
      description: 'Create a new pipeline (kanban board) for deal tracking.',
      inputSchema: z.object({
        name: z.string().describe('Pipeline name'),
      }),
      execute: async (params) => {
        try {
          const pipeline = await caller.pipeline.create({
            organizationId,
            name: params.name,
          })
          return {
            success: true,
            pipelineId: pipeline.id,
            name: pipeline.name,
            message: `Created pipeline "${params.name}" (ID: ${pipeline.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createPipeline', err)
        }
      },
    }),

    /**
     * List all pipelines with their lanes.
     * Includes lane IDs so the AI can create tickets / move tickets by lane ID.
     * Routes through tRPC `pipeline.list` which enforces PIPELINES_READ permission.
     */
    listPipelines: tool({
      description:
        'List all pipelines in the organization with their lanes. ' +
        'Use the lane IDs from the result to create tickets or move tickets.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const pipelines = await caller.pipeline.list({ organizationId })
          return {
            success: true,
            pipelines: pipelines.map((p) => ({
              id: p.id,
              name: p.name,
              lanes: p.lanes.map((l) => ({
                id: l.id,
                name: l.name,
                order: l.order,
              })),
            })),
            message: `Found ${pipelines.length} pipelines`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listPipelines', err)
        }
      },
    }),

    /**
     * Create a lane (column) in a pipeline.
     * Routes through tRPC `pipeline.createLane` which enforces PIPELINES_UPDATE permission.
     * The tRPC procedure also verifies pipeline ownership before creating.
     */
    createLane: tool({
      description: 'Create a new lane (column) in a pipeline.',
      inputSchema: z.object({
        pipelineId: z.string().describe('The pipeline ID to add the lane to'),
        name: z.string().describe('Lane name (e.g., "Qualified", "Proposal", "Closed")'),
      }),
      execute: async (params) => {
        try {
          /** tRPC createLane expects organizationId in the data object (not a separate param) */
          const lane = await caller.pipeline.createLane({
            organizationId,
            pipelineId: params.pipelineId,
            name: params.name,
          })
          return {
            success: true,
            laneId: lane.id,
            name: lane.name,
            message: `Created lane "${params.name}" (ID: ${lane.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createLane', err)
        }
      },
    }),

    /**
     * Get a pipeline with its lanes and tickets.
     * Returns full details including ticket IDs for move/update/delete operations.
     * Routes through tRPC `pipeline.getById` which enforces PIPELINES_READ permission
     * and verifies pipeline ownership.
     */
    getPipeline: tool({
      description:
        'Get a pipeline by ID with all its lanes and tickets. ' +
        'Use this to find ticket IDs and lane IDs for move/update/delete operations.',
      inputSchema: z.object({
        pipelineId: z.string().describe('The pipeline ID'),
      }),
      execute: async (params) => {
        try {
          /** tRPC getById requires organizationId for ownership verification */
          const pipeline = await caller.pipeline.getById({
            organizationId,
            pipelineId: params.pipelineId,
          })
          return {
            success: true,
            pipeline: {
              id: pipeline.id,
              name: pipeline.name,
              lanes: pipeline.lanes.map((l) => ({
                id: l.id,
                name: l.name,
                order: l.order,
                tickets: l.tickets.map((t) => ({
                  id: t.id,
                  title: t.title,
                  value: t.value,
                  order: t.order,
                })),
              })),
            },
            message: `Found pipeline "${pipeline.name}" with ${pipeline.lanes.length} lanes`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getPipeline', err)
        }
      },
    }),

    /**
     * Create a ticket (card) in a pipeline lane.
     * Routes through tRPC `pipeline.createTicket` which enforces:
     * - PIPELINES_CREATE permission
     * - tickets.limit feature gate
     * - Lane ownership verification
     */
    createTicket: tool({
      description: 'Create a new ticket (card) in a pipeline lane.',
      inputSchema: z.object({
        laneId: z.string().describe('The lane ID to add the ticket to'),
        title: z.string().describe('Ticket title'),
        description: z.string().optional().describe('Ticket description'),
        value: z.number().optional().describe('Deal value in dollars (e.g., 5000 for $5,000)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC createTicket expects organizationId in the data object (not a separate param) */
          const ticket = await caller.pipeline.createTicket({
            organizationId,
            laneId: params.laneId,
            title: params.title,
            description: params.description,
            value: params.value,
          })
          return {
            success: true,
            ticketId: ticket.id,
            title: ticket.title,
            message: `Created ticket "${params.title}" (ID: ${ticket.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createTicket', err)
        }
      },
    }),

    /**
     * Move a ticket to a different lane in the pipeline.
     * Routes through tRPC `pipeline.moveTicket` which enforces PIPELINES_UPDATE permission
     * and verifies both ticket and target lane ownership.
     */
    moveTicket: tool({
      description: 'Move a ticket to a different lane in the pipeline.',
      inputSchema: z.object({
        ticketId: z.string().describe('The ticket ID to move'),
        targetLaneId: z.string().describe('The lane ID to move the ticket to'),
      }),
      execute: async (params) => {
        try {
          /** tRPC moveTicket uses flat object with newOrder instead of positional params */
          const ticket = await caller.pipeline.moveTicket({
            organizationId,
            ticketId: params.ticketId,
            targetLaneId: params.targetLaneId,
            newOrder: 0,
          })
          return {
            success: true,
            ticketId: ticket?.id ?? params.ticketId,
            message: `Moved ticket to new lane`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('moveTicket', err)
        }
      },
    }),

    /**
     * Update a ticket's details.
     * Only provide the fields you want to change.
     * Routes through tRPC `pipeline.updateTicket` which enforces PIPELINES_UPDATE
     * permission and verifies ticket ownership.
     */
    updateTicket: tool({
      description:
        'Update a ticket (change title, description, or value). Only provide the fields you want to change. ' +
        'Use the ticket ID from createTicket or getPipeline results.',
      inputSchema: z.object({
        ticketId: z.string().describe('The ticket ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        value: z.number().optional().describe('New deal value in dollars (e.g., 5000 for $5,000)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC updateTicket uses flat object with organizationId + ticketId + data fields */
          const { ticketId, ...data } = params
          const ticket = await caller.pipeline.updateTicket({
            organizationId,
            ticketId,
            ...data,
          })
          return {
            success: true,
            ticketId: ticket.id,
            title: ticket.title,
            message: `Updated ticket "${ticket.title}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateTicket', err)
        }
      },
    }),

    /**
     * Delete a ticket permanently — ALWAYS confirm with askUser first.
     * Routes through tRPC `pipeline.deleteTicket` which enforces:
     * - PIPELINES_DELETE permission
     * - tickets.limit feature gate decrement
     * - Ticket ownership verification
     */
    deleteTicket: tool({
      description:
        'Permanently delete a ticket from a pipeline lane. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        ticketId: z.string().describe('The ticket ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.pipeline.deleteTicket({
            organizationId,
            ticketId: params.ticketId,
          })
          return {
            success: true,
            ticketId: params.ticketId,
            message: 'Deleted ticket',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteTicket', err)
        }
      },
    }),
  }
}
