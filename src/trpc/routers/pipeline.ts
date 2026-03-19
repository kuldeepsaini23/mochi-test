/**
 * Pipeline Router
 *
 * tRPC router for pipeline/kanban board management.
 * Uses organizationProcedure for authorization.
 * All data access goes through pipeline.service.ts (DAL).
 *
 * SOURCE OF TRUTH KEYWORDS: Pipeline, PipelineLane, PipelineTicket, Kanban, SalesBoard
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import * as pipelineService from '@/services/pipeline.service'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS - Exported for use by AI tools (single source of truth)
// ============================================================================

/**
 * Schema for getting or creating the default pipeline for an organization
 */
export const getOrCreatePipelineSchema = z.object({
  organizationId: z.string(),
})

/**
 * Schema for getting a specific pipeline
 */
export const getPipelineSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
})

/**
 * Schema for creating a new pipeline
 */
export const createPipelineSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Pipeline name is required'),
  description: z.string().optional().nullable(),
})

/**
 * Schema for updating a pipeline
 */
export const updatePipelineSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
})

/**
 * Schema for deleting a pipeline
 */
export const deletePipelineSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
})

/**
 * Schema for creating a lane
 */
export const createLaneSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
  name: z.string().min(1, 'Lane name is required'),
  color: z.string().optional().nullable(),
})

/**
 * Schema for updating a lane
 */
export const updateLaneSchema = z.object({
  organizationId: z.string(),
  laneId: z.string(),
  name: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
})

/**
 * Schema for deleting a lane
 */
export const deleteLaneSchema = z.object({
  organizationId: z.string(),
  laneId: z.string(),
})

/**
 * Schema for reordering lanes
 */
export const reorderLanesSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
  laneOrders: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
})

/**
 * Schema for creating a ticket
 * NOTE: Uses z.coerce.date() to handle JSON serialization (dates come as strings from client)
 */
export const createTicketSchema = z.object({
  organizationId: z.string(),
  laneId: z.string(),
  title: z.string().min(1, 'Ticket title is required'),
  description: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
})

/**
 * Schema for updating a ticket
 * NOTE: Uses z.coerce.date() to handle JSON serialization (dates come as strings from client)
 */
export const updateTicketSchema = z.object({
  organizationId: z.string(),
  ticketId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
})

/**
 * Schema for fast description-only update
 * WHY: Optimized for auto-save during typing - minimal payload
 */
export const updateTicketDescriptionSchema = z.object({
  organizationId: z.string(),
  ticketId: z.string(),
  description: z.string().nullable(),
})

/**
 * Schema for deleting a ticket
 */
export const deleteTicketSchema = z.object({
  organizationId: z.string(),
  ticketId: z.string(),
})

/**
 * Schema for moving a ticket (cross-lane or same-lane reorder)
 * This is the primary drag-and-drop operation
 */
export const moveTicketSchema = z.object({
  organizationId: z.string(),
  ticketId: z.string(),
  targetLaneId: z.string(),
  newOrder: z.number(),
})

/**
 * Schema for batch reordering tickets within a lane
 */
export const reorderTicketsSchema = z.object({
  organizationId: z.string(),
  laneId: z.string(),
  ticketOrders: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
    })
  ),
})

// ============================================================================
// INFINITE SCROLL SCHEMAS
// ============================================================================

/**
 * Schema for fetching paginated lanes with initial tickets
 * WHY: Enables infinite scroll for lanes (horizontal scrolling)
 */
export const getInfiniteLanesSchema = z.object({
  organizationId: z.string(),
  pipelineId: z.string(),
  limit: z.number().int().positive().max(20).default(5),
  cursor: z.string().nullish(),
  ticketLimit: z.number().int().positive().max(50).default(10),
})

/**
 * Schema for fetching paginated tickets within a lane
 * WHY: Enables infinite scroll for tickets within each lane column
 */
export const getInfiniteTicketsSchema = z.object({
  organizationId: z.string(),
  laneId: z.string(),
  limit: z.number().int().positive().max(50).default(10),
  cursor: z.string().nullish(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const pipelineRouter = createTRPCRouter({
  // ============================================================================
  // PIPELINE OPERATIONS
  // ============================================================================

  /**
   * Get or create the default pipeline for an organization
   * WHY: Most organizations only need one pipeline, so we auto-create it
   */
  getOrCreate: organizationProcedure({ requirePermission: permissions.PIPELINES_READ })
    .input(getOrCreatePipelineSchema)
    .query(async ({ input }) => {
      const { organizationId } = input
      return await pipelineService.getOrCreateDefaultPipeline(organizationId)
    }),

  /**
   * Get a specific pipeline by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.PIPELINES_READ })
    .input(getPipelineSchema)
    .query(async ({ input }) => {
      const { organizationId, pipelineId } = input

      // Verify ownership before returning
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      const pipeline = await pipelineService.getPipeline(pipelineId)
      if (!pipeline) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      return pipeline
    }),

  /**
   * List all pipelines for an organization
   */
  list: organizationProcedure({ requirePermission: permissions.PIPELINES_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await pipelineService.listPipelines(input.organizationId)
    }),

  /**
   * Create a new pipeline
   *
   * FEATURE GATE: pipelines.limit
   * Checks organization's pipeline limit before creating
   */
  /** Feature-gated: pipelines.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.PIPELINES_CREATE,
    requireFeature: 'pipelines.limit',
  })
    .input(createPipelineSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, name, description } = input

      const pipeline = await pipelineService.createPipeline({
        organizationId,
        name,
        description,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'pipelines.limit')

      return pipeline
    }),

  /**
   * Update a pipeline
   */
  update: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(updatePipelineSchema)
    .mutation(async ({ input }) => {
      const { organizationId, pipelineId, ...data } = input

      // Verify ownership
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      return await pipelineService.updatePipeline(pipelineId, data)
    }),

  /**
   * Delete a pipeline (soft delete)
   *
   * FEATURE GATE: pipelines.limit
   * Decrements usage after successful deletion to free up quota
   */
  delete: organizationProcedure({ requirePermission: permissions.PIPELINES_DELETE })
    .input(deletePipelineSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, pipelineId } = input

      // Verify ownership
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      await pipelineService.deletePipeline(pipelineId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'pipelines.limit')

      return { success: true, message: 'Pipeline deleted' }
    }),

  // ============================================================================
  // LANE OPERATIONS
  // ============================================================================

  /**
   * Create a new lane in a pipeline
   */
  createLane: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(createLaneSchema)
    .mutation(async ({ input }) => {
      const { organizationId, pipelineId, name, color } = input

      // Verify pipeline ownership
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      return await pipelineService.createLane({
        pipelineId,
        name,
        color,
      })
    }),

  /**
   * Update a lane
   */
  updateLane: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(updateLaneSchema)
    .mutation(async ({ input }) => {
      const { organizationId, laneId, ...data } = input

      // Verify lane ownership
      const isOwner = await pipelineService.verifyLaneOwnership(laneId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lane not found',
        })
      }

      return await pipelineService.updateLane(laneId, data)
    }),

  /**
   * Delete a lane (soft delete - also soft deletes all tickets in lane)
   */
  deleteLane: organizationProcedure({ requirePermission: permissions.PIPELINES_DELETE })
    .input(deleteLaneSchema)
    .mutation(async ({ input }) => {
      const { organizationId, laneId } = input

      // Verify lane ownership
      const isOwner = await pipelineService.verifyLaneOwnership(laneId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lane not found',
        })
      }

      await pipelineService.deleteLane(laneId)
      return { success: true, message: 'Lane deleted' }
    }),

  /**
   * Reorder lanes within a pipeline
   * WHY: Used when dragging lanes to reorder them
   */
  reorderLanes: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(reorderLanesSchema)
    .mutation(async ({ input }) => {
      const { organizationId, pipelineId, laneOrders } = input

      // Verify pipeline ownership
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      return await pipelineService.reorderLanes(pipelineId, laneOrders)
    }),

  // ============================================================================
  // TICKET OPERATIONS
  // ============================================================================

  /**
   * Create a new ticket in a lane
   *
   * FEATURE GATE: tickets.limit
   * Checks organization's ticket limit before creating
   */
  /** Feature-gated: tickets.limit checked at procedure level before handler runs */
  createTicket: organizationProcedure({
    requirePermission: permissions.PIPELINES_CREATE,
    requireFeature: 'tickets.limit',
  })
    .input(createTicketSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, laneId, ...data } = input

      // Verify lane ownership
      const isOwner = await pipelineService.verifyLaneOwnership(laneId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lane not found',
        })
      }

      const ticket = await pipelineService.createTicket({
        laneId,
        ...data,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'tickets.limit')

      return ticket
    }),

  /**
   * Update a ticket
   */
  updateTicket: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(updateTicketSchema)
    .mutation(async ({ input }) => {
      const { organizationId, ticketId, ...data } = input

      // Verify ticket ownership
      const isOwner = await pipelineService.verifyTicketOwnership(ticketId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Ticket not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Ticket not found',
        })
      }

      return await pipelineService.updateTicket(ticketId, data)
    }),

  /**
   * Fast description-only update
   * WHY: Optimized for auto-save during typing
   * HOW: Single query combines ownership check with update - no separate verify step
   */
  updateTicketDescription: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(updateTicketDescriptionSchema)
    .mutation(async ({ input }) => {
      const { organizationId, ticketId, description } = input

      // Fast path: single query with ownership check built-in
      const result = await pipelineService.updateTicketDescriptionFast(
        ticketId,
        organizationId,
        description
      )

      if (!result) {
        throw createStructuredError('NOT_FOUND', 'Ticket not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Ticket not found',
        })
      }

      return result
    }),

  /**
   * Delete a ticket (soft delete)
   *
   * FEATURE GATE: tickets.limit
   * Decrements usage after successful deletion to free up quota
   */
  deleteTicket: organizationProcedure({ requirePermission: permissions.PIPELINES_DELETE })
    .input(deleteTicketSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ticketId } = input

      // Verify ticket ownership
      const isOwner = await pipelineService.verifyTicketOwnership(ticketId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Ticket not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Ticket not found',
        })
      }

      await pipelineService.deleteTicket(ticketId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'tickets.limit')

      return { success: true, message: 'Ticket deleted' }
    }),

  /**
   * Move a ticket to a different lane and/or reorder within lane
   * WHY: This is the core drag-and-drop operation for the kanban board
   * HOW: Handles both cross-lane moves and same-lane reordering atomically
   */
  moveTicket: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(moveTicketSchema)
    .mutation(async ({ input }) => {
      const { organizationId, ticketId, targetLaneId, newOrder } = input

      // Verify ticket ownership
      const isTicketOwner = await pipelineService.verifyTicketOwnership(ticketId, organizationId)
      if (!isTicketOwner) {
        throw createStructuredError('NOT_FOUND', 'Ticket not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Ticket not found',
        })
      }

      // Verify target lane ownership
      const isLaneOwner = await pipelineService.verifyLaneOwnership(targetLaneId, organizationId)
      if (!isLaneOwner) {
        throw createStructuredError('NOT_FOUND', 'Target lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Target lane not found',
        })
      }

      return await pipelineService.moveTicket(ticketId, targetLaneId, newOrder)
    }),

  /**
   * Batch reorder tickets within a lane
   * WHY: More efficient than multiple moveTicket calls for same-lane reordering
   */
  reorderTickets: organizationProcedure({ requirePermission: permissions.PIPELINES_UPDATE })
    .input(reorderTicketsSchema)
    .mutation(async ({ input }) => {
      const { organizationId, laneId, ticketOrders } = input

      // Verify lane ownership
      const isLaneOwner = await pipelineService.verifyLaneOwnership(laneId, organizationId)
      if (!isLaneOwner) {
        throw createStructuredError('NOT_FOUND', 'Lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lane not found',
        })
      }

      return await pipelineService.reorderTickets(laneId, ticketOrders)
    }),

  // ============================================================================
  // INFINITE SCROLL OPERATIONS
  // ============================================================================

  /**
   * Get paginated lanes for a pipeline with initial ticket batch
   * WHY: Enables infinite scroll for lanes (horizontal scrolling)
   *
   * Each lane includes only the first page of tickets for initial render.
   * Use getInfiniteTickets to load more tickets per lane as user scrolls.
   *
   * HOW: Cursor-based pagination using lane ID as cursor
   */
  getInfiniteLanes: organizationProcedure({ requirePermission: permissions.PIPELINES_READ })
    .input(getInfiniteLanesSchema)
    .query(async ({ input }) => {
      const { organizationId, pipelineId, limit, cursor, ticketLimit } = input

      // Verify pipeline ownership
      const isOwner = await pipelineService.verifyPipelineOwnership(pipelineId, organizationId)
      if (!isOwner) {
        throw createStructuredError('NOT_FOUND', 'Pipeline not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Pipeline not found',
        })
      }

      return await pipelineService.getLanesForPipeline(
        pipelineId,
        limit,
        cursor ?? undefined,
        ticketLimit
      )
    }),

  /**
   * Get paginated tickets for a lane
   * WHY: Enables infinite scroll for tickets within each lane column
   *
   * Use this to load more tickets as user scrolls down within a lane.
   *
   * HOW: Cursor-based pagination using ticket ID as cursor
   */
  getInfiniteTickets: organizationProcedure({ requirePermission: permissions.PIPELINES_READ })
    .input(getInfiniteTicketsSchema)
    .query(async ({ input }) => {
      const { organizationId, laneId, limit, cursor } = input

      // Verify lane ownership
      const isLaneOwner = await pipelineService.verifyLaneOwnership(laneId, organizationId)
      if (!isLaneOwner) {
        throw createStructuredError('NOT_FOUND', 'Lane not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Lane not found',
        })
      }

      return await pipelineService.getTicketsForLane(laneId, limit, cursor ?? undefined)
    }),
})
