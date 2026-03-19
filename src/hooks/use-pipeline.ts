'use client'

/**
 * Pipeline Hooks - TRPC Implementation with Optimistic UI
 *
 * SOURCE OF TRUTH: These hooks use TRPC for server communication with optimistic updates.
 * All data is persisted in the database via the pipeline service layer.
 *
 * ARCHITECTURE:
 * - usePipeline: Main hook for fetching/managing pipeline data
 * - usePipelineList: Hook for listing all pipelines (for selector)
 * - useLaneMutations: Mutations for lane CRUD operations
 * - useTicketMutations: Mutations for ticket CRUD operations (including drag-and-drop)
 *
 * Search Keywords: SOURCE OF TRUTH, PIPELINE HOOKS, OPTIMISTIC UI, TRPC
 */

import { useMemo, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import type { Pipeline, PipelineWithLanes } from '@/types/pipeline'

// ============================================================================
// TRANSFORMATION HELPERS
// ============================================================================

/**
 * Transforms Prisma pipeline data into client-friendly format
 * WHY: Prisma returns nested relations that need flattening for UI
 *
 * NOTE: We use explicit type annotation to handle TRPC serialization
 * where Date objects are converted to strings during transport
 */
function transformPipelineData(data: PipelineWithLanes): Pipeline {
  return {
    id: data.id,
    organizationId: data.organizationId,
    name: data.name,
    description: data.description,
    lanes: data.lanes.map((lane) => ({
      id: lane.id,
      pipelineId: lane.pipelineId,
      name: lane.name,
      order: lane.order,
      color: lane.color,
      tickets: lane.tickets.map((ticket) => ({
        id: ticket.id,
        laneId: ticket.laneId,
        title: ticket.title,
        description: ticket.description,
        order: ticket.order,
        value: ticket.value,
        deadline: ticket.deadline ? new Date(ticket.deadline) : null,
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
        createdAt: new Date(ticket.createdAt),
        updatedAt: new Date(ticket.updatedAt),
      })),
      createdAt: new Date(lane.createdAt),
      updatedAt: new Date(lane.updatedAt),
    })),
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

// ============================================================================
// PIPELINE LIST HOOK - For pipeline selector
// ============================================================================

/**
 * Options for usePipelineList hook
 * WHY: Allows calling component to handle feature limit errors from server
 */
interface UsePipelineListOptions {
  /** Called when server returns FEATURE_LIMIT_EXCEEDED error */
  onFeatureLimitExceeded?: () => void
}

/**
 * Hook for listing all pipelines in an organization
 * Used by the pipeline selector component
 */
export function usePipelineList(organizationId: string, options?: UsePipelineListOptions) {
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.pipeline.list.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      staleTime: 60000,
    }
  )

  /**
   * Create pipeline mutation
   * WHY: Handles server-side feature gate errors by calling onFeatureLimitExceeded callback
   */
  const createMutation = trpc.pipeline.create.useMutation({
    onSuccess: () => {
      toast.success('Pipeline created')
      utils.pipeline.list.invalidate({ organizationId })
    },
    onError: (err) => {
      // Check if this is a feature limit error from the server
      // The error.data.cause contains structured error info from withFeatureGate
      const errorData = err.data as { cause?: { type?: string } } | undefined
      const cause = errorData?.cause
      if (cause?.type === 'FEATURE_LIMIT_EXCEEDED') {
        // Call the callback if provided (component will show upgrade modal)
        options?.onFeatureLimitExceeded?.()
      } else {
        toast.error(err.message || 'Failed to create pipeline')
      }
    },
  })

  const pipelines = useMemo(() => {
    if (!data) return []
    return data.map((p) => ({ id: p.id, name: p.name }))
  }, [data])

  /**
   * Create a new pipeline and return it
   * WHY: Returns the created pipeline so caller can navigate to it
   */
  const createPipeline = useCallback(
    async (name: string) => {
      const newPipeline = await createMutation.mutateAsync({
        organizationId,
        name,
      })
      return newPipeline
    },
    [organizationId, createMutation]
  )

  return {
    pipelines,
    isLoading,
    createPipeline,
    isCreating: createMutation.isPending,
  }
}

// ============================================================================
// MAIN PIPELINE HOOK
// ============================================================================

/**
 * Main hook for fetching and managing pipeline data
 *
 * WHY: Provides the pipeline data and refresh functionality
 * HOW: Uses TRPC getOrCreate query which auto-creates default pipeline if none exists
 */
export function usePipeline(organizationId: string, pipelineId?: string) {
  const utils = trpc.useUtils()

  /**
   * Query for fetching/creating the default pipeline (when no pipelineId specified)
   */
  const defaultQuery = trpc.pipeline.getOrCreate.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && !pipelineId,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Query for fetching a specific pipeline by ID
   */
  const specificQuery = trpc.pipeline.getById.useQuery(
    { organizationId, pipelineId: pipelineId! },
    {
      enabled: !!organizationId && !!pipelineId,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  )

  const query = pipelineId ? specificQuery : defaultQuery

  /**
   * Transform raw TRPC data into client-friendly format
   */
  const pipeline = useMemo(() => {
    if (!query.data) return null
    return transformPipelineData(query.data as unknown as PipelineWithLanes)
  }, [query.data])

  /**
   * Invalidate function to force re-fetch (used after mutations)
   */
  const invalidate = useCallback(async () => {
    if (pipelineId) {
      await utils.pipeline.getById.invalidate({ organizationId, pipelineId })
    } else {
      await utils.pipeline.getOrCreate.invalidate({ organizationId })
    }
  }, [utils.pipeline, organizationId, pipelineId])

  return {
    pipeline,
    pipelineId: pipeline?.id ?? null,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
    invalidate,
  }
}

// ============================================================================
// LANE MUTATIONS HOOK
// ============================================================================

/**
 * Hook for lane mutations with optimistic UI
 *
 * ARCHITECTURE: Uses TRPC mutations with cache invalidation.
 * Optimistic updates happen via the pipeline-board's local state.
 */
export function useLaneMutations(organizationId: string, pipelineId?: string) {
  const utils = trpc.useUtils()

  const invalidateAll = useCallback(() => {
    utils.pipeline.getOrCreate.invalidate({ organizationId })
    if (pipelineId) {
      utils.pipeline.getById.invalidate({ organizationId, pipelineId })
    }
    utils.pipeline.list.invalidate({ organizationId })
    utils.pipeline.getInfiniteLanes.invalidate()
  }, [utils.pipeline, organizationId, pipelineId])

  /**
   * Create lane mutation
   */
  const createLaneMutation = trpc.pipeline.createLane.useMutation({
    onSuccess: () => {
      toast.success('Lane created')
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create lane')
    },
  })

  /**
   * Update lane mutation
   */
  const updateLaneMutation = trpc.pipeline.updateLane.useMutation({
    onSuccess: () => {
      toast.success('Lane updated')
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update lane')
    },
  })

  /**
   * Delete lane mutation
   */
  const deleteLaneMutation = trpc.pipeline.deleteLane.useMutation({
    onSuccess: () => {
      toast.success('Lane deleted')
      invalidateAll()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete lane')
    },
  })

  /**
   * Reorder lanes mutation
   */
  const reorderLanesMutation = trpc.pipeline.reorderLanes.useMutation({
    onError: (err) => {
      toast.error(err.message || 'Failed to reorder lanes')
    },
    onSettled: () => {
      invalidateAll()
    },
  })

  /**
   * Wrapper functions with simpler API
   */
  const createLane = useCallback(
    async (input: { pipelineId: string; name: string; color?: string | null }) => {
      return createLaneMutation.mutateAsync({
        organizationId,
        pipelineId: input.pipelineId,
        name: input.name,
        color: input.color,
      })
    },
    [organizationId, createLaneMutation]
  )

  const updateLane = useCallback(
    async (input: { id: string; name?: string; color?: string | null }) => {
      return updateLaneMutation.mutateAsync({
        organizationId,
        laneId: input.id,
        name: input.name,
        color: input.color,
      })
    },
    [organizationId, updateLaneMutation]
  )

  const deleteLane = useCallback(
    async (laneId: string) => {
      return deleteLaneMutation.mutateAsync({
        organizationId,
        laneId,
      })
    },
    [organizationId, deleteLaneMutation]
  )

  const reorderLanes = useCallback(
    async (targetPipelineId: string, laneIds: string[]) => {
      return reorderLanesMutation.mutateAsync({
        organizationId,
        pipelineId: targetPipelineId,
        laneOrders: laneIds.map((id, index) => ({ id, order: index })),
      })
    },
    [organizationId, reorderLanesMutation]
  )

  return {
    createLane,
    updateLane,
    deleteLane,
    reorderLanes,
    isCreating: createLaneMutation.isPending,
    isUpdating: updateLaneMutation.isPending,
    isDeleting: deleteLaneMutation.isPending,
    isReordering: reorderLanesMutation.isPending,
  }
}

// ============================================================================
// TICKET MUTATIONS HOOK
// ============================================================================

/**
 * Options for useTicketMutations hook
 * WHY: Allows calling component to handle feature limit errors from server
 */
interface UseTicketMutationsOptions {
  /** Called when server returns FEATURE_LIMIT_EXCEEDED error on ticket creation */
  onFeatureLimitExceeded?: () => void
}

/**
 * Hook for ticket mutations with optimistic UI
 *
 * ARCHITECTURE: Uses TRPC mutations with cache invalidation.
 * The moveTicket and reorderTickets mutations handle drag-and-drop.
 */
export function useTicketMutations(
  organizationId: string,
  pipelineId?: string,
  options?: UseTicketMutationsOptions
) {
  const utils = trpc.useUtils()

  /**
   * Invalidate AND immediately refetch infinite lanes in the background.
   *
   * WHY not just invalidate(): invalidate() marks cache stale and refetches
   * only while the query is actively observed. If the user navigates away
   * before the refetch completes, it gets cancelled. When they come back,
   * the query re-mounts with stale data and must refetch from scratch (~2s).
   *
   * FIX: After invalidating, we explicitly call refetch() which keeps the
   * fetch alive even if the component unmounts. The result lands in the
   * cache so when the user navigates back, fresh data is already there.
   */
  const invalidateAndRefetch = useCallback(async () => {
    // Invalidate non-infinite queries (these are lightweight)
    utils.pipeline.getOrCreate.invalidate({ organizationId })
    if (pipelineId) {
      utils.pipeline.getById.invalidate({ organizationId, pipelineId })
    }

    /**
     * For infinite lanes: invalidate to mark stale, then immediately refetch.
     * The refetch runs in the background and survives component unmount,
     * ensuring the cache is warm when the user returns to this pipeline.
     */
    await utils.pipeline.getInfiniteLanes.invalidate()
    utils.pipeline.getInfiniteLanes.refetch()
  }, [utils.pipeline, organizationId, pipelineId])

  /**
   * Create ticket mutation
   *
   * WHY onSettled with invalidate-only (no refetch):
   * The optimistic UI in pipeline-board.tsx adds the ticket immediately with
   * a temp ID. If we force-refetch here, the server data triggers the sync
   * useEffect which can overwrite the optimistic state before the temp→real
   * ID swap completes — making the ticket disappear.
   *
   * Instead, we just invalidate (mark stale). The optimistic state persists
   * while the user stays on this pipeline. When they navigate away and back,
   * the stale query auto-refetches and returns fresh data with the real ticket.
   *
   * WHY: Handles server-side feature gate errors by calling onFeatureLimitExceeded callback
   */
  const createTicketMutation = trpc.pipeline.createTicket.useMutation({
    onSuccess: () => {
      toast.success('Ticket created')
    },
    onSettled: () => {
      /**
       * Invalidate only — do NOT call refetch() here.
       * The optimistic UI already shows the ticket. Force-refetching
       * triggers the serverLanes→pipeline sync useEffect which clobbers
       * the optimistic state, making the ticket vanish momentarily.
       */
      utils.pipeline.getOrCreate.invalidate({ organizationId })
      if (pipelineId) {
        utils.pipeline.getById.invalidate({ organizationId, pipelineId })
      }
      utils.pipeline.getInfiniteLanes.invalidate()
    },
    onError: (err) => {
      // Check if this is a feature limit error from the server
      // The error.data.cause contains structured error info from withFeatureGate
      const errorData = err.data as { cause?: { type?: string } } | undefined
      const cause = errorData?.cause
      if (cause?.type === 'FEATURE_LIMIT_EXCEEDED') {
        // Call the callback if provided (component will show upgrade modal)
        options?.onFeatureLimitExceeded?.()
      } else {
        toast.error(err.message || 'Failed to create ticket')
      }
    },
  })

  /**
   * Update ticket mutation
   * NOTE: We don't invalidate cache here to prevent race conditions.
   * The local optimistic update in pipeline-board.tsx handles UI state.
   * Cache will be refreshed on next navigation or page load.
   */
  const updateTicketMutation = trpc.pipeline.updateTicket.useMutation({
    onError: (err) => {
      toast.error(err.message || 'Failed to update ticket')
    },
  })

  /**
   * Fast description-only update mutation
   * WHY: Optimized for auto-save during typing - single query, no includes
   */
  const updateDescriptionMutation = trpc.pipeline.updateTicketDescription.useMutation({
    onError: (err) => {
      toast.error(err.message || 'Failed to save description')
    },
  })

  /**
   * Delete ticket mutation
   * WHY invalidateAndRefetch: Same rationale as createTicket — invalidate + immediate
   * refetch warms the cache so switching pipelines shows fresh data instantly.
   */
  const deleteTicketMutation = trpc.pipeline.deleteTicket.useMutation({
    onSuccess: () => {
      toast.success('Ticket deleted')
    },
    onSettled: () => {
      invalidateAndRefetch()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete ticket')
    },
  })

  /**
   * Move ticket mutation - for cross-lane moves and single ticket reorder
   * WHY invalidateAndRefetch: Ensures cache is warm after drag-and-drop
   */
  const moveTicketMutation = trpc.pipeline.moveTicket.useMutation({
    onError: (err) => {
      toast.error(err.message || 'Failed to move ticket')
    },
    onSettled: () => {
      invalidateAndRefetch()
    },
  })

  /**
   * Reorder tickets mutation - for batch reordering within a lane
   * WHY invalidateAndRefetch: Ensures cache is warm after reordering
   */
  const reorderTicketsMutation = trpc.pipeline.reorderTickets.useMutation({
    onError: (err) => {
      toast.error(err.message || 'Failed to reorder tickets')
    },
    onSettled: () => {
      invalidateAndRefetch()
    },
  })

  /**
   * Wrapper functions with simpler API
   */
  const createTicket = useCallback(
    async (input: {
      laneId: string
      title: string
      description?: string | null
      value?: number | null
      assignedToId?: string | null
      deadline?: Date | null
    }) => {
      return createTicketMutation.mutateAsync({
        organizationId,
        laneId: input.laneId,
        title: input.title,
        description: input.description,
        value: input.value,
        assignedToId: input.assignedToId,
        deadline: input.deadline,
      })
    },
    [organizationId, createTicketMutation]
  )

  const updateTicket = useCallback(
    async (input: {
      id: string
      title?: string
      description?: string | null
      value?: number | null
      assignedToId?: string | null
      leadId?: string | null
      deadline?: Date | null
    }) => {
      return updateTicketMutation.mutateAsync({
        organizationId,
        ticketId: input.id,
        title: input.title,
        description: input.description,
        value: input.value,
        assignedToId: input.assignedToId,
        leadId: input.leadId,
        deadline: input.deadline,
      })
    },
    [organizationId, updateTicketMutation]
  )

  /**
   * Fast description-only update - optimized for auto-save
   * WHY: Uses single query with built-in ownership check, no extra includes
   */
  const updateTicketDescription = useCallback(
    async (ticketId: string, description: string | null) => {
      return updateDescriptionMutation.mutateAsync({
        organizationId,
        ticketId,
        description,
      })
    },
    [organizationId, updateDescriptionMutation]
  )

  const deleteTicket = useCallback(
    async (ticketId: string) => {
      return deleteTicketMutation.mutateAsync({
        organizationId,
        ticketId,
      })
    },
    [organizationId, deleteTicketMutation]
  )

  const moveTicket = useCallback(
    async (input: { ticketId: string; targetLaneId: string; newOrder: number }) => {
      return moveTicketMutation.mutateAsync({
        organizationId,
        ticketId: input.ticketId,
        targetLaneId: input.targetLaneId,
        newOrder: input.newOrder,
      })
    },
    [organizationId, moveTicketMutation]
  )

  const reorderTickets = useCallback(
    async (laneId: string, ticketIds: string[]) => {
      return reorderTicketsMutation.mutateAsync({
        organizationId,
        laneId,
        ticketOrders: ticketIds.map((id, index) => ({ id, order: index })),
      })
    },
    [organizationId, reorderTicketsMutation]
  )

  return {
    createTicket,
    updateTicket,
    updateTicketDescription,
    deleteTicket,
    moveTicket,
    reorderTickets,
    isCreating: createTicketMutation.isPending,
    isUpdating: updateTicketMutation.isPending,
    isUpdatingDescription: updateDescriptionMutation.isPending,
    isDeleting: deleteTicketMutation.isPending,
    isMoving: moveTicketMutation.isPending,
    isReordering: reorderTicketsMutation.isPending,
  }
}

// ============================================================================
// TEAM MEMBERS HOOK
// ============================================================================

/**
 * Hook to get available team members for assignment
 * Uses the organization members list from TRPC
 */
export function useTeamMembers(organizationId: string) {
  const { data, isLoading } = trpc.organization.getOrganizationMembers.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      staleTime: 60000,
    }
  )

  /**
   * Transform member data into simplified format for ticket assignment
   * Filters out pending members (only show active members)
   */
  const members = useMemo(() => {
    if (!data) return []
    return data
      .filter((member) => !member.isPending)
      .map((member) => ({
        id: member.id,
        name: member.user.name ?? 'Unknown',
        email: member.user.email,
        image: member.user.image ?? null,
      }))
  }, [data])

  return {
    members,
    isLoading,
  }
}

// ============================================================================
// INFINITE SCROLL HOOKS - For optimized pagination
// ============================================================================

/**
 * Infinite lane data structure with pagination metadata
 * WHY: Each lane needs to track its own ticket pagination state
 */
export interface InfiniteLane {
  id: string
  pipelineId: string
  name: string
  order: number
  color: string | null
  ticketCount: number
  /**
   * Total monetary value of ALL tickets in this lane
   * WHY: This is calculated server-side using an aggregate query to ensure
   * it reflects the true total, not just the sum of paginated/loaded tickets
   */
  totalValue: number
  tickets: Array<{
    id: string
    laneId: string
    title: string
    description: string | null
    order: number
    value: number | null
    deadline: Date | null
    assignedTo: {
      id: string
      name: string
      email: string
      image: string | null
    } | null
    lead: {
      id: string
      firstName: string | null
      lastName: string | null
      email: string
      phone: string | null
      avatarUrl: string | null
    } | null
    createdAt: Date
    updatedAt: Date
  }>
  ticketNextCursor: string | null
  hasMoreTickets: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Hook for infinite scroll lanes
 * WHY: Enables lazy-loading lanes as user scrolls horizontally
 *
 * USAGE:
 * const { lanes, hasMore, fetchNextPage, isLoading } = useInfiniteLanes(orgId, pipelineId)
 */
export function useInfiniteLanes(
  organizationId: string,
  pipelineId: string,
  options?: { limit?: number; ticketLimit?: number }
) {
  const { limit = 5, ticketLimit = 10 } = options ?? {}

  const query = trpc.pipeline.getInfiniteLanes.useInfiniteQuery(
    { organizationId, pipelineId, limit, ticketLimit },
    {
      enabled: !!organizationId && !!pipelineId,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      /**
       * Cache configuration for optimal UX when switching pipelines:
       * - staleTime: Data is fresh for 5 minutes (no refetch needed)
       * - gcTime: Keep in cache for 30 minutes even when not used
       * WHY: When user switches to another pipeline and back, we show cached data instantly.
       * NOTE: We intentionally do NOT set refetchOnMount: false here. That would prevent
       * invalidated queries from refetching when the user navigates back to a pipeline.
       * The staleTime already prevents unnecessary refetches for fresh data.
       */
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache when inactive
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Transform raw API data into client-friendly format with dates
   * WHY: TRPC serializes dates as strings, we need to convert them back
   */
  const lanes = useMemo((): InfiniteLane[] => {
    if (!query.data?.pages) return []

    return query.data.pages.flatMap((page) =>
      page.lanes.map((lane) => ({
        id: lane.id,
        pipelineId: lane.pipelineId,
        name: lane.name,
        order: lane.order,
        color: lane.color,
        ticketCount: lane.ticketCount,
        /**
         * Server-calculated total value of ALL tickets in this lane
         * This is the true total, not just the sum of loaded/paginated tickets
         */
        totalValue: lane.totalValue,
        ticketNextCursor: lane.ticketNextCursor,
        hasMoreTickets: lane.hasMoreTickets,
        tickets: lane.tickets.map((ticket) => ({
          id: ticket.id,
          laneId: ticket.laneId,
          title: ticket.title,
          description: ticket.description,
          order: ticket.order,
          value: ticket.value,
          deadline: ticket.deadline ? new Date(ticket.deadline) : null,
          assignedTo: ticket.assignedTo?.user
            ? {
                id: ticket.assignedTo.id,
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
          createdAt: new Date(ticket.createdAt),
          updatedAt: new Date(ticket.updatedAt),
        })),
        createdAt: new Date(lane.createdAt),
        updatedAt: new Date(lane.updatedAt),
      }))
    )
  }, [query.data?.pages])

  /**
   * Total lane count from the first page
   * WHY: We need this for UI elements like progress indicators
   */
  const totalCount = query.data?.pages[0]?.totalCount ?? 0

  return {
    lanes,
    totalCount,
    hasMore: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
    refetch: query.refetch,
  }
}

/**
 * Hook for infinite scroll tickets within a lane
 * WHY: Enables lazy-loading tickets as user scrolls down within a lane
 *
 * USAGE:
 * const { tickets, hasMore, fetchNextPage, isLoading } = useInfiniteTickets(orgId, laneId)
 */
export function useInfiniteTickets(
  organizationId: string,
  laneId: string,
  options?: { limit?: number; enabled?: boolean }
) {
  const { limit = 10, enabled = true } = options ?? {}

  const query = trpc.pipeline.getInfiniteTickets.useInfiniteQuery(
    { organizationId, laneId, limit },
    {
      enabled: !!organizationId && !!laneId && enabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      /**
       * Cache configuration for optimal UX:
       * - staleTime: Data is fresh for 5 minutes
       * - gcTime: Keep in cache for 30 minutes when inactive
       * WHY: Loaded tickets stay cached when scrolling back up or switching lanes.
       * NOTE: No refetchOnMount: false — invalidated queries must refetch when re-observed.
       */
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Transform raw API data into client-friendly format with dates
   * WHY: TRPC serializes dates as strings, we need to convert them back
   */
  const tickets = useMemo(() => {
    if (!query.data?.pages) return []

    return query.data.pages.flatMap((page) =>
      page.tickets.map((ticket) => ({
        id: ticket.id,
        laneId: ticket.laneId,
        title: ticket.title,
        description: ticket.description,
        order: ticket.order,
        value: ticket.value,
        deadline: ticket.deadline ? new Date(ticket.deadline) : null,
        assignedTo: ticket.assignedTo?.user
          ? {
              id: ticket.assignedTo.id,
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
        createdAt: new Date(ticket.createdAt),
        updatedAt: new Date(ticket.updatedAt),
      }))
    )
  }, [query.data?.pages])

  /**
   * Total ticket count from the first page
   * WHY: We need this for UI elements like progress indicators
   */
  const totalCount = query.data?.pages[0]?.totalCount ?? 0

  return {
    tickets,
    totalCount,
    hasMore: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: query.error ? new Error(query.error.message) : null,
    refetch: query.refetch,
  }
}

// ============================================================================
// LEGACY EXPORTS FOR COMPATIBILITY
// ============================================================================

/**
 * Default lane colors for backwards compatibility
 */
export const DEFAULT_LANES_CONFIG = [
  { name: 'Pending', color: '#6366f1' },
  { name: 'In Progress', color: '#f59e0b' },
  { name: 'Blocked', color: '#ef4444' },
  { name: 'Completed', color: '#10b981' },
]
