/**
 * Pipeline Types - SOURCE OF TRUTH for Pipeline Feature
 *
 * These types are derived from Prisma-generated types for the Pipeline schema.
 * The base types come from Prisma, but we extend them with relations and
 * UI-specific properties here.
 *
 * SOURCE OF TRUTH KEYWORDS: Pipeline, PipelineLane, PipelineTicket, Kanban, SalesBoard
 */

import type { Prisma } from '@/generated/prisma'

// ============================================================================
// PRISMA INFERENCE - Types derived from Prisma schema
// ============================================================================

/**
 * Full pipeline type with all relations (lanes and tickets)
 * This matches what the service layer returns from getPipeline/getOrCreateDefaultPipeline
 */
export type PipelineWithLanes = Prisma.PipelineGetPayload<{
  include: {
    lanes: {
      include: {
        tickets: {
          include: {
            assignedTo: {
              include: {
                user: {
                  select: { id: true; name: true; email: true; image: true }
                }
              }
            }
            lead: {
              select: {
                id: true
                firstName: true
                lastName: true
                email: true
                phone: true
                avatarUrl: true
              }
            }
          }
        }
      }
    }
  }
}>

/**
 * Lane with tickets and assignee info
 */
export type LaneWithTickets = Prisma.PipelineLaneGetPayload<{
  include: {
    tickets: {
      include: {
        assignedTo: {
          include: {
            user: {
              select: { id: true; name: true; email: true; image: true }
            }
          }
        }
        lead: {
          select: {
            id: true
            firstName: true
            lastName: true
            email: true
            phone: true
            avatarUrl: true
          }
        }
      }
    }
  }
}>

/**
 * Ticket with assignee and lead info
 */
export type TicketWithAssignee = Prisma.PipelineTicketGetPayload<{
  include: {
    assignedTo: {
      include: {
        user: {
          select: { id: true; name: true; email: true; image: true }
        }
      }
    }
    lead: {
      select: {
        id: true
        firstName: true
        lastName: true
        email: true
        phone: true
        avatarUrl: true
      }
    }
  }
}>

// ============================================================================
// UI TYPES - Transformed types for client-side use
// ============================================================================

/**
 * Represents a team member who can be assigned to tickets
 * Extracted from Member->User relation for simpler client-side use
 */
export interface PipelineTeamMember {
  id: string
  name: string
  email: string
  image: string | null
}

/**
 * Represents a lead linked to a ticket
 * Contains essential lead info for display in ticket UI
 */
export interface PipelineLead {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  avatarUrl: string | null
}

/**
 * Client-friendly ticket representation
 * Transforms the nested Prisma relation into a flat structure
 */
export interface PipelineTicket {
  id: string
  laneId: string
  title: string
  description: string | null
  order: number
  value: number | null
  deadline: Date | null
  assignedTo: PipelineTeamMember | null
  lead: PipelineLead | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Client-friendly lane representation
 */
export interface PipelineLane {
  id: string
  pipelineId: string
  name: string
  order: number
  color: string | null
  /**
   * Total count of ALL tickets in lane (not just loaded/paginated)
   * WHY: Useful for displaying accurate counts in lane headers
   */
  ticketCount?: number
  /**
   * Total monetary value of ALL tickets in lane (not just loaded/paginated)
   * WHY: Server-calculated to ensure accuracy regardless of pagination state
   */
  totalValue?: number
  tickets: PipelineTicket[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Client-friendly pipeline representation
 */
export interface Pipeline {
  id: string
  organizationId: string
  name: string
  description: string | null
  lanes: PipelineLane[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// TRANSFORMATION HELPERS
// ============================================================================

/**
 * Transforms Prisma ticket with nested assignee and lead into client-friendly format
 */
export function transformTicket(ticket: TicketWithAssignee): PipelineTicket {
  return {
    id: ticket.id,
    laneId: ticket.laneId,
    title: ticket.title,
    description: ticket.description,
    order: ticket.order,
    value: ticket.value,
    deadline: ticket.deadline,
    assignedTo: ticket.assignedTo?.user
      ? {
          id: ticket.assignedTo.id, // Use member ID (not user ID) for lookup
          name: ticket.assignedTo.user.name ?? 'Unknown',
          email: ticket.assignedTo.user.email,
          image: ticket.assignedTo.user.image,
        }
      : null,
    lead: ticket.lead
      ? {
          id: ticket.lead.id,
          firstName: ticket.lead.firstName,
          lastName: ticket.lead.lastName,
          email: ticket.lead.email,
          phone: ticket.lead.phone,
          avatarUrl: ticket.lead.avatarUrl,
        }
      : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }
}

/**
 * Transforms Prisma lane with tickets into client-friendly format
 */
export function transformLane(lane: LaneWithTickets): PipelineLane {
  return {
    id: lane.id,
    pipelineId: lane.pipelineId,
    name: lane.name,
    order: lane.order,
    color: lane.color,
    tickets: lane.tickets.map(transformTicket),
    createdAt: lane.createdAt,
    updatedAt: lane.updatedAt,
  }
}

/**
 * Transforms Prisma pipeline with lanes into client-friendly format
 */
export function transformPipeline(pipeline: PipelineWithLanes): Pipeline {
  return {
    id: pipeline.id,
    organizationId: pipeline.organizationId,
    name: pipeline.name,
    description: pipeline.description,
    lanes: pipeline.lanes.map(transformLane),
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  }
}

// ============================================================================
// INPUT TYPES - For creating/updating entities
// These match the expected input format for TRPC mutations
// ============================================================================

/**
 * Input for creating a new pipeline
 */
export interface CreatePipelineInput {
  organizationId: string
  name: string
  description?: string | null
}

/**
 * Input for updating an existing pipeline
 */
export interface UpdatePipelineInput {
  id: string
  name?: string
  description?: string | null
}

/**
 * Input for creating a new lane
 */
export interface CreateLaneInput {
  pipelineId: string
  name: string
  color?: string | null
  order?: number
}

/**
 * Input for updating an existing lane
 */
export interface UpdateLaneInput {
  id: string
  name?: string
  color?: string | null
  order?: number
}

/**
 * Input for creating a new ticket
 */
export interface CreateTicketInput {
  laneId: string
  title: string
  description?: string | null
  value?: number | null
  assignedToId?: string | null
  order?: number
}

/**
 * Input for updating an existing ticket
 */
export interface UpdateTicketInput {
  id: string
  title?: string
  description?: string | null
  value?: number | null
  assignedToId?: string | null
  order?: number
}

/**
 * Input for moving a ticket to a different lane
 */
export interface MoveTicketInput {
  ticketId: string
  targetLaneId: string
  newOrder: number
}

/**
 * Input for reordering a lane within the pipeline
 */
export interface ReorderLaneInput {
  laneId: string
  newOrder: number
}

// ============================================================================
// PAGINATION TYPES - For infinite scroll support
// ============================================================================

/**
 * Pagination parameters for fetching tickets
 */
export interface TicketPaginationParams {
  laneId: string
  limit: number
  cursor?: string
}

/**
 * Paginated response for tickets
 */
export interface PaginatedTicketsResponse {
  tickets: PipelineTicket[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

/**
 * Pagination parameters for fetching lanes
 * WHY: Lanes can be lazy-loaded as user scrolls horizontally
 */
export interface LanePaginationParams {
  pipelineId: string
  limit: number
  cursor?: string
}

/**
 * Paginated response for lanes
 * WHY: Each lane includes only the first page of tickets for initial render
 */
export interface PaginatedLanesResponse {
  lanes: PipelineLane[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

/**
 * Lane with ticket count for infinite scroll
 * WHY: When lazy-loading lanes, we need to know total ticket count before fetching them
 */
export interface LaneWithTicketCount {
  id: string
  pipelineId: string
  name: string
  order: number
  color: string | null
  ticketCount: number
  tickets: PipelineTicket[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// UI STATE TYPES - For optimistic updates and local state
// ============================================================================

/**
 * Represents an optimistic ticket update (before server confirmation)
 */
export interface OptimisticTicketUpdate {
  ticketId: string
  operation: 'create' | 'update' | 'delete' | 'move'
  previousState?: PipelineTicket
  newState?: Partial<PipelineTicket>
  targetLaneId?: string
}

/**
 * Drag state for tracking drag-and-drop operations
 */
export interface DragState {
  activeId: string | null
  activeType: 'ticket' | 'lane' | null
  overId: string | null
}

/**
 * Default lane colors for new lanes
 * Provides consistent visual styling across the application
 */
export const DEFAULT_LANE_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#84cc16', // Lime
] as const
