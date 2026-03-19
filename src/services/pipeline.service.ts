/**
 * Pipeline Service (DAL)
 *
 * Data Access Layer for all pipeline/kanban operations.
 * This is the ONLY place that should interact with Prisma for pipelines.
 *
 * SOURCE OF TRUTH KEYWORDS: Pipeline, PipelineLane, PipelineTicket, Kanban, SalesBoard
 *
 * tRPC routers call these functions after security checks.
 */

import { prisma } from '@/lib/config'
import type { Prisma } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

export type PipelineCreateInput = {
  organizationId: string
  name: string
  description?: string | null
}

export type PipelineUpdateInput = {
  name?: string
  description?: string | null
}

export type LaneCreateInput = {
  pipelineId: string
  name: string
  color?: string | null
  order?: number
}

export type LaneUpdateInput = {
  name?: string
  color?: string | null
}

export type TicketCreateInput = {
  laneId: string
  title: string
  description?: string | null
  value?: number | null
  assignedToId?: string | null
  deadline?: Date | null
  order?: number
}

export type TicketUpdateInput = {
  title?: string
  description?: string | null
  value?: number | null
  assignedToId?: string | null
  leadId?: string | null
  deadline?: Date | null
}

// ============================================================================
// DEFAULT INCLUDES - Standard relations to include with queries
// ============================================================================

const LANE_WITH_TICKETS = {
  tickets: {
    where: { deletedAt: null },
    orderBy: { order: 'asc' as const },
    include: {
      assignedTo: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.PipelineLaneInclude

const PIPELINE_WITH_LANES = {
  lanes: {
    where: { deletedAt: null },
    orderBy: { order: 'asc' as const },
    include: LANE_WITH_TICKETS,
  },
} satisfies Prisma.PipelineInclude

// ============================================================================
// PIPELINE CRUD
// ============================================================================

/**
 * Get a pipeline with all lanes and tickets
 */
export async function getPipeline(pipelineId: string) {
  return prisma.pipeline.findUnique({
    where: { id: pipelineId, deletedAt: null },
    include: PIPELINE_WITH_LANES,
  })
}

/**
 * Get the default (first) pipeline for an organization
 * Creates one if none exists
 */
export async function getOrCreateDefaultPipeline(organizationId: string) {
  // Try to find existing pipeline
  let pipeline = await prisma.pipeline.findFirst({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: PIPELINE_WITH_LANES,
  })

  // Create default pipeline if none exists
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        organizationId,
        name: 'Sales Pipeline',
        description: 'Track your deals from lead to close',
        lanes: {
          create: [
            { name: 'New Lead', order: 0, color: '#6366f1' },
            { name: 'Qualified', order: 1, color: '#8b5cf6' },
            { name: 'Proposal', order: 2, color: '#f59e0b' },
            { name: 'Negotiation', order: 3, color: '#ec4899' },
            { name: 'Won', order: 4, color: '#10b981' },
          ],
        },
      },
      include: PIPELINE_WITH_LANES,
    })
  }

  return pipeline
}

/**
 * List all pipelines for an organization
 */
export async function listPipelines(organizationId: string) {
  return prisma.pipeline.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      lanes: {
        where: { deletedAt: null },
        select: { id: true, name: true, order: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Create a new pipeline
 *
 * @param input - Pipeline data to create
 * @param userId - Optional user ID to log the activity
 */
export async function createPipeline(input: PipelineCreateInput, userId?: string) {
  const pipeline = await prisma.pipeline.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      lanes: {
        create: [
          { name: 'To Do', order: 0, color: '#6366f1' },
          { name: 'In Progress', order: 1, color: '#f59e0b' },
          { name: 'Done', order: 2, color: '#10b981' },
        ],
      },
    },
    include: PIPELINE_WITH_LANES,
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'pipeline',
      entityId: pipeline.id,
    })
  }

  return pipeline
}

/**
 * Update a pipeline
 *
 * @param pipelineId - Pipeline ID to update
 * @param input - Pipeline data to update
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function updatePipeline(
  pipelineId: string,
  input: PipelineUpdateInput,
  organizationId?: string,
  userId?: string
) {
  // Scope update by organizationId when available to prevent cross-org mutation.
  // The router verifies ownership separately, but scoping the query adds defense-in-depth.
  const pipeline = await prisma.pipeline.update({
    where: { id: pipelineId, ...(organizationId && { organizationId }) },
    data: input,
    include: PIPELINE_WITH_LANES,
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'pipeline',
      entityId: pipeline.id,
    })
  }

  return pipeline
}

/**
 * Delete a pipeline and all its lanes/tickets
 * WHY: Hard delete - permanently removes from database
 *
 * @param pipelineId - Pipeline ID to delete
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function deletePipeline(pipelineId: string, organizationId?: string, userId?: string) {
  // Delete all tickets in all lanes of this pipeline first
  await prisma.pipelineTicket.deleteMany({
    where: { lane: { pipelineId } },
  })

  // Delete all lanes in the pipeline
  await prisma.pipelineLane.deleteMany({
    where: { pipelineId },
  })

  // Scope delete by organizationId when available to prevent cross-org mutation
  const deletedPipeline = await prisma.pipeline.delete({
    where: { id: pipelineId, ...(organizationId && { organizationId }) },
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'pipeline',
      entityId: deletedPipeline.id,
    })
  }

  return deletedPipeline
}

// ============================================================================
// LANE CRUD
// ============================================================================

/**
 * Create a new lane
 *
 * @param input - Lane data to create
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function createLane(input: LaneCreateInput, organizationId?: string, userId?: string) {
  // Get the highest order in the pipeline
  const maxOrder = await prisma.pipelineLane.aggregate({
    where: { pipelineId: input.pipelineId, deletedAt: null },
    _max: { order: true },
  })

  const order = input.order ?? (maxOrder._max.order ?? -1) + 1

  const lane = await prisma.pipelineLane.create({
    data: {
      pipelineId: input.pipelineId,
      name: input.name,
      color: input.color,
      order,
    },
    include: LANE_WITH_TICKETS,
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'pipeline_stage',
      entityId: lane.id,
    })
  }

  return lane
}

/**
 * Update a lane
 *
 * @param laneId - Lane ID to update
 * @param input - Lane data to update
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function updateLane(
  laneId: string,
  input: LaneUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const lane = await prisma.pipelineLane.update({
    where: { id: laneId },
    data: input,
    include: LANE_WITH_TICKETS,
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'pipeline_stage',
      entityId: lane.id,
    })
  }

  return lane
}

/**
 * Delete a lane and all its tickets
 * WHY: Hard delete - permanently removes from database
 *
 * @param laneId - Lane ID to delete
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function deleteLane(laneId: string, organizationId?: string, userId?: string) {
  // Delete all tickets in the lane first
  await prisma.pipelineTicket.deleteMany({
    where: { laneId },
  })

  // Delete the lane
  const deletedLane = await prisma.pipelineLane.delete({
    where: { id: laneId },
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'pipeline_stage',
      entityId: deletedLane.id,
    })
  }

  return deletedLane
}

/**
 * Reorder lanes within a pipeline
 *
 * @param pipelineId - Pipeline ID containing the lanes
 * @param laneOrders - Array of lane IDs and their new orders
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activities
 */
export async function reorderLanes(
  pipelineId: string,
  laneOrders: { id: string; order: number }[],
  organizationId?: string,
  userId?: string
) {
  await prisma.$transaction(
    laneOrders.map(({ id, order }) =>
      prisma.pipelineLane.update({
        where: { id },
        data: { order },
      })
    )
  )

  // Log activities for all reordered lanes if userId and organizationId are provided
  if (userId && organizationId && laneOrders.length > 0) {
    logActivities(
      laneOrders.map(({ id }) => ({
        userId,
        organizationId,
        action: 'update' as const,
        entity: 'pipeline_stage',
        entityId: id,
      }))
    )
  }

  return getPipeline(pipelineId)
}

// ============================================================================
// TICKET CRUD
// ============================================================================

/**
 * Create a new ticket at the TOP of the lane
 * WHY: New tickets should appear at the top for visibility and recency
 * HOW: Shifts all existing tickets down by incrementing their order, then creates new ticket with order 0
 *
 * @param input - Ticket data to create
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function createTicket(
  input: TicketCreateInput,
  organizationId?: string,
  userId?: string
) {
  const ticket = await prisma.$transaction(async (tx) => {
    /**
     * Shift all existing tickets in the lane down by 1
     * WHY: Make room for the new ticket at position 0 (top)
     */
    await tx.pipelineTicket.updateMany({
      where: { laneId: input.laneId, deletedAt: null },
      data: { order: { increment: 1 } },
    })

    /**
     * Create the new ticket with order 0 (top of lane)
     */
    return tx.pipelineTicket.create({
      data: {
        laneId: input.laneId,
        title: input.title,
        description: input.description,
        value: input.value,
        assignedToId: input.assignedToId,
        deadline: input.deadline,
        order: 0,
      },
      include: {
        assignedTo: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    })
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'pipeline_card',
      entityId: ticket.id,
    })
  }

  return ticket
}

/**
 * Update a ticket
 *
 * @param ticketId - Ticket ID to update
 * @param input - Ticket data to update
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function updateTicket(
  ticketId: string,
  input: TicketUpdateInput,
  organizationId?: string,
  userId?: string
) {
  // Scope update by organizationId when available to prevent cross-org mutation
  const ticket = await prisma.pipelineTicket.update({
    where: {
      id: ticketId,
      ...(organizationId && { lane: { pipeline: { organizationId } } }),
    },
    data: input,
    include: {
      assignedTo: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
        },
      },
    },
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'pipeline_card',
      entityId: ticket.id,
    })
  }

  return ticket
}

/**
 * Fast update for ticket description only
 * WHY: Optimized for auto-save during typing - minimal query, no includes
 * Combines ownership check with update in single query for speed
 *
 * @param ticketId - The ticket to update
 * @param organizationId - For ownership verification
 * @param description - The new description content
 * @returns Updated ticket ID or null if not found/not owned
 */
export async function updateTicketDescriptionFast(
  ticketId: string,
  organizationId: string,
  description: string | null
) {
  // Use updateMany with ownership check - faster than separate verify + update
  // Returns count of updated records (0 if ticket doesn't exist or not owned)
  const result = await prisma.pipelineTicket.updateMany({
    where: {
      id: ticketId,
      deletedAt: null,
      lane: {
        deletedAt: null,
        pipeline: { organizationId, deletedAt: null },
      },
    },
    data: { description },
  })

  return result.count > 0 ? { id: ticketId, description } : null
}

/**
 * Delete a ticket
 * WHY: Hard delete - permanently removes from database
 *
 * @param ticketId - Ticket ID to delete
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function deleteTicket(ticketId: string, organizationId?: string, userId?: string) {
  // Scope delete by organizationId when available to prevent cross-org mutation
  const deletedTicket = await prisma.pipelineTicket.delete({
    where: {
      id: ticketId,
      ...(organizationId && { lane: { pipeline: { organizationId } } }),
    },
  })

  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'pipeline_card',
      entityId: deletedTicket.id,
    })
  }

  return deletedTicket
}

/**
 * Move a ticket to a different lane and/or reorder within lane
 *
 * This is the core function for drag-and-drop operations.
 * Handles both cross-lane moves and within-lane reordering.
 *
 * @param ticketId - Ticket ID to move
 * @param targetLaneId - Target lane ID
 * @param newOrder - New order position in the target lane
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activity
 */
export async function moveTicket(
  ticketId: string,
  targetLaneId: string,
  newOrder: number,
  organizationId?: string,
  userId?: string
) {
  // Get the ticket's current lane with details for automation trigger
  const ticket = await prisma.pipelineTicket.findUnique({
    where: { id: ticketId },
    select: {
      laneId: true,
      order: true,
      leadId: true,
      lane: {
        select: {
          id: true,
          name: true,
          pipeline: {
            select: { id: true, organizationId: true },
          },
        },
      },
    },
  })

  if (!ticket) {
    throw new Error('Ticket not found')
  }

  const sourceLaneId = ticket.laneId
  const isCrossLaneMove = sourceLaneId !== targetLaneId

  // Get target lane info for automation trigger (only if cross-lane move)
  let targetLane: { id: string; name: string } | null = null
  if (isCrossLaneMove) {
    targetLane = await prisma.pipelineLane.findUnique({
      where: { id: targetLaneId },
      select: { id: true, name: true },
    })
  }

  await prisma.$transaction(async (tx) => {
    if (isCrossLaneMove) {
      // Cross-lane move: shift tickets in source lane up, shift tickets in target lane down

      // Source lane: shift tickets after the removed ticket up
      await tx.pipelineTicket.updateMany({
        where: {
          laneId: sourceLaneId,
          order: { gt: ticket.order },
          deletedAt: null,
        },
        data: { order: { decrement: 1 } },
      })

      // Target lane: shift tickets at and after insert position down
      await tx.pipelineTicket.updateMany({
        where: {
          laneId: targetLaneId,
          order: { gte: newOrder },
          deletedAt: null,
        },
        data: { order: { increment: 1 } },
      })
    } else {
      // Same-lane reorder
      const oldOrder = ticket.order

      if (newOrder > oldOrder) {
        // Moving down: shift tickets between old and new position up
        await tx.pipelineTicket.updateMany({
          where: {
            laneId: targetLaneId,
            order: { gt: oldOrder, lte: newOrder },
            deletedAt: null,
            id: { not: ticketId },
          },
          data: { order: { decrement: 1 } },
        })
      } else if (newOrder < oldOrder) {
        // Moving up: shift tickets between new and old position down
        await tx.pipelineTicket.updateMany({
          where: {
            laneId: targetLaneId,
            order: { gte: newOrder, lt: oldOrder },
            deletedAt: null,
            id: { not: ticketId },
          },
          data: { order: { increment: 1 } },
        })
      }
    }

    // Update the ticket's lane and order
    await tx.pipelineTicket.update({
      where: { id: ticketId },
      data: { laneId: targetLaneId, order: newOrder },
    })
  })

  // Trigger automations for PIPELINE_TICKET_MOVED event (fires on ticket stage changes)
  // This fires any active automations listening for ticket updates.
  // leadId is optional — tickets without a lead still trigger, and lead-dependent
  // steps will gracefully skip with a reason (SkipActionError system).
  if (isCrossLaneMove && targetLane) {
    try {
      const { triggerAutomation } = await import('@/services/automation.service')
      await triggerAutomation('PIPELINE_TICKET_MOVED', {
        organizationId: ticket.lane.pipeline.organizationId,
        leadId: ticket.leadId ?? undefined,
        triggerData: {
          type: 'PIPELINE_TICKET_MOVED',
          ticketId,
          pipelineId: ticket.lane.pipeline.id,
          fromStageId: ticket.lane.id,
          fromStageName: ticket.lane.name,
          toStageId: targetLane.id,
          toStageName: targetLane.name,
        },
      })
    } catch (automationError) {
      // Log but don't fail the ticket update if automation trigger fails
      console.error('Failed to trigger automation for pipeline ticket update:', automationError)
    }
  }
  // Log activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'pipeline_card',
      entityId: ticketId,
    })
  }

  // Return the updated ticket
  return prisma.pipelineTicket.findUnique({
    where: { id: ticketId },
    include: {
      assignedTo: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  })
}

/**
 * Reorder tickets within a lane
 * Used for batch reordering operations
 *
 * @param laneId - Lane ID containing the tickets
 * @param ticketOrders - Array of ticket IDs and their new orders
 * @param organizationId - Optional organization ID for activity logging
 * @param userId - Optional user ID to log the activities
 */
export async function reorderTickets(
  laneId: string,
  ticketOrders: { id: string; order: number }[],
  organizationId?: string,
  userId?: string
) {
  await prisma.$transaction(
    ticketOrders.map(({ id, order }) =>
      prisma.pipelineTicket.update({
        where: { id },
        data: { order },
      })
    )
  )

  // Log activities for all reordered tickets if userId and organizationId are provided
  if (userId && organizationId && ticketOrders.length > 0) {
    logActivities(
      ticketOrders.map(({ id }) => ({
        userId,
        organizationId,
        action: 'update' as const,
        entity: 'pipeline_card',
        entityId: id,
      }))
    )
  }

  return prisma.pipelineLane.findUnique({
    where: { id: laneId },
    include: LANE_WITH_TICKETS,
  })
}

// ============================================================================
// VERIFICATION HELPERS
// ============================================================================

/**
 * Verify a pipeline belongs to an organization
 */
export async function verifyPipelineOwnership(
  pipelineId: string,
  organizationId: string
): Promise<boolean> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, organizationId, deletedAt: null },
    select: { id: true },
  })
  return !!pipeline
}

/**
 * Verify a lane belongs to a pipeline (and indirectly to an organization)
 */
export async function verifyLaneOwnership(
  laneId: string,
  organizationId: string
): Promise<boolean> {
  const lane = await prisma.pipelineLane.findFirst({
    where: {
      id: laneId,
      deletedAt: null,
      pipeline: { organizationId, deletedAt: null },
    },
    select: { id: true },
  })
  return !!lane
}

/**
 * Verify a ticket belongs to an organization's pipeline
 */
export async function verifyTicketOwnership(
  ticketId: string,
  organizationId: string
): Promise<boolean> {
  const ticket = await prisma.pipelineTicket.findFirst({
    where: {
      id: ticketId,
      deletedAt: null,
      lane: {
        deletedAt: null,
        pipeline: { organizationId, deletedAt: null },
      },
    },
    select: { id: true },
  })
  return !!ticket
}

/**
 * Get the pipeline ID for a lane
 */
export async function getPipelineIdForLane(laneId: string): Promise<string | null> {
  const lane = await prisma.pipelineLane.findUnique({
    where: { id: laneId },
    select: { pipelineId: true },
  })
  return lane?.pipelineId ?? null
}

/**
 * Get the pipeline ID for a ticket
 */
export async function getPipelineIdForTicket(ticketId: string): Promise<string | null> {
  const ticket = await prisma.pipelineTicket.findUnique({
    where: { id: ticketId },
    select: { lane: { select: { pipelineId: true } } },
  })
  return ticket?.lane.pipelineId ?? null
}

// ============================================================================
// PAGINATION FUNCTIONS - For infinite scroll
// ============================================================================

/**
 * Ticket include configuration for pagination queries
 * WHY: Reused across paginated ticket fetching functions
 */
const TICKET_INCLUDE = {
  assignedTo: {
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  },
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  },
} as const

/**
 * Get paginated tickets for a lane
 * WHY: Enables infinite scroll within each lane column
 *
 * Uses cursor-based pagination with ticket ID as cursor.
 * Tickets are sorted by order ascending for consistent display.
 *
 * @param laneId - The lane to fetch tickets from
 * @param limit - Number of tickets to fetch per page
 * @param cursor - Optional cursor (ticket ID) to start from
 * @returns Paginated tickets with hasMore flag and next cursor
 */
export async function getTicketsForLane(
  laneId: string,
  limit: number = 10,
  cursor?: string
) {
  // Get total count for the lane
  const totalCount = await prisma.pipelineTicket.count({
    where: { laneId, deletedAt: null },
  })

  // Fetch tickets with cursor-based pagination
  // We fetch limit + 1 to check if there are more items
  const tickets = await prisma.pipelineTicket.findMany({
    where: { laneId, deletedAt: null },
    take: limit + 1,
    orderBy: { order: 'asc' },
    include: TICKET_INCLUDE,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor itself
    }),
  })

  // Check if there are more items
  let nextCursor: string | null = null
  const hasMore = tickets.length > limit

  if (hasMore) {
    // Remove the extra item and get its ID as cursor
    const nextItem = tickets.pop()
    nextCursor = nextItem?.id ?? null
  }

  return {
    tickets,
    nextCursor,
    hasMore,
    totalCount,
  }
}

/**
 * Get paginated lanes for a pipeline with initial ticket batch
 * WHY: Enables infinite scroll for lanes (horizontal scrolling)
 *
 * Each lane includes only the first page of tickets for initial render.
 * User can load more tickets per lane as they scroll within the lane.
 *
 * @param pipelineId - The pipeline to fetch lanes from
 * @param limit - Number of lanes to fetch per page
 * @param cursor - Optional cursor (lane ID) to start from
 * @param ticketLimit - Number of tickets to include per lane (default 10)
 * @returns Paginated lanes with hasMore flag and next cursor
 */
export async function getLanesForPipeline(
  pipelineId: string,
  limit: number = 5,
  cursor?: string,
  ticketLimit: number = 10
) {
  /**
   * Run count and lanes queries in parallel for better performance
   * We also need to get the total value for each lane (sum of all ticket values)
   */
  const [totalCount, lanes] = await Promise.all([
    // Get total count for the pipeline
    prisma.pipelineLane.count({
      where: { pipelineId, deletedAt: null },
    }),
    // Fetch lanes with cursor-based pagination
    // We fetch limit + 1 to check if there are more items
    prisma.pipelineLane.findMany({
      where: { pipelineId, deletedAt: null },
      take: limit + 1,
      orderBy: { order: 'asc' },
      include: {
        tickets: {
          where: { deletedAt: null },
          take: ticketLimit + 1, // +1 to check hasMore for tickets
          orderBy: { order: 'asc' },
          include: TICKET_INCLUDE,
        },
        _count: {
          select: { tickets: { where: { deletedAt: null } } },
        },
      },
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
    }),
  ])

  // Check if there are more lanes
  let nextCursor: string | null = null
  const hasMore = lanes.length > limit

  if (hasMore) {
    // Remove the extra lane and get its ID as cursor
    const nextItem = lanes.pop()
    nextCursor = nextItem?.id ?? null
  }

  /**
   * Get total value for each lane using aggregate query
   * WHY: This is more performant than calculating from all tickets in memory
   * or making N separate queries. We use groupBy to get all lane totals in one query.
   */
  const laneIds = lanes.map((lane) => lane.id)
  const laneValueAggregates = await prisma.pipelineTicket.groupBy({
    by: ['laneId'],
    where: {
      laneId: { in: laneIds },
      deletedAt: null,
    },
    _sum: {
      value: true,
    },
  })

  // Create a map for quick lookup of lane totals
  const laneTotalValueMap = new Map<string, number>()
  for (const agg of laneValueAggregates) {
    laneTotalValueMap.set(agg.laneId, agg._sum.value ?? 0)
  }

  // Transform lanes to include ticket pagination info and total value
  const transformedLanes = lanes.map((lane) => {
    const hasMoreTickets = lane.tickets.length > ticketLimit
    const tickets = hasMoreTickets ? lane.tickets.slice(0, ticketLimit) : lane.tickets
    const ticketNextCursor = hasMoreTickets ? tickets[tickets.length - 1]?.id : null

    return {
      ...lane,
      tickets,
      ticketCount: lane._count.tickets,
      /**
       * Total value of ALL tickets in this lane (not just paginated ones)
       * WHY: The lane header should show the total value across all tickets,
       * regardless of how many are currently rendered on screen
       */
      totalValue: laneTotalValueMap.get(lane.id) ?? 0,
      ticketNextCursor,
      hasMoreTickets,
    }
  })

  return {
    lanes: transformedLanes,
    nextCursor,
    hasMore,
    totalCount,
  }
}

/**
 * Get ticket count for a lane
 * WHY: Used to show total count in lane header when using pagination
 */
export async function getTicketCountForLane(laneId: string): Promise<number> {
  return prisma.pipelineTicket.count({
    where: { laneId, deletedAt: null },
  })
}

// ============================================================================
// AUTOMATION HELPERS
// ============================================================================

/**
 * Find the most recent ticket for a lead
 * WHY: Automations need to find which ticket to update when triggered by lead events
 *
 * @param leadId - The lead to find tickets for
 * @returns The most recent ticket for the lead, or null if none found
 */
export async function findTicketByLeadId(leadId: string) {
  return prisma.pipelineTicket.findFirst({
    where: { leadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      laneId: true,
      title: true,
      order: true,
    },
  })
}

/**
 * Create a ticket for automation purposes
 * WHY: Automations may need to create tickets with specific lead associations
 *
 * Unlike `createTicket` which puts tickets at the top, this places tickets
 * at the bottom of the lane (higher order) since automated tickets are typically
 * less urgent than manually created ones.
 *
 * @param input - Ticket creation input with required leadId
 * @returns The created ticket
 */
export async function createTicketForLead(input: TicketCreateInput & { leadId: string }) {
  // Get the highest order in this lane to place new ticket at the end
  const lastTicket = await prisma.pipelineTicket.findFirst({
    where: { laneId: input.laneId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const newOrder = (lastTicket?.order ?? -1) + 1

  return prisma.pipelineTicket.create({
    data: {
      laneId: input.laneId,
      leadId: input.leadId,
      title: input.title,
      description: input.description,
      value: input.value,
      order: newOrder,
    },
    select: {
      id: true,
      title: true,
      laneId: true,
    },
  })
}

/**
 * Update a ticket's lane (simplified for automation)
 * WHY: Automations need a simple way to update ticket stages without complex ordering logic
 *
 * Places the ticket at the end of the target lane.
 *
 * @param ticketId - The ticket to update
 * @param targetLaneId - The lane to update to
 * @returns The updated ticket
 */
export async function moveTicketToLane(ticketId: string, targetLaneId: string) {
  // Get the highest order in the target lane
  const lastTicket = await prisma.pipelineTicket.findFirst({
    where: { laneId: targetLaneId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  const newOrder = (lastTicket?.order ?? -1) + 1

  return prisma.pipelineTicket.update({
    where: { id: ticketId },
    data: { laneId: targetLaneId, order: newOrder },
    select: {
      id: true,
      title: true,
      laneId: true,
    },
  })
}
