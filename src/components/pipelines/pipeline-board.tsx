'use client'

/**
 * PipelineBoard Component - Kanban Board with Drag & Drop
 *
 * ARCHITECTURE: Simple optimistic updates
 * - localPipeline is the UI source of truth
 * - Server sync only on initial load or error rollback
 * - All drag operations update localPipeline immediately
 * - Mutations run in background, errors trigger rollback
 *
 * PERMISSIONS:
 * - pipelines:read - Can view pipeline board and tickets
 * - pipelines:create - Can create new pipelines, lanes, and tickets
 * - pipelines:update - Can edit lanes, tickets, and reorder items
 * - pipelines:delete - Can delete lanes and tickets
 *
 * SOURCE OF TRUTH: dnd-kit sortable pattern, Pipeline, PipelineLane, PipelineTicket
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { TicketDetailPanel } from './ticket-detail-view'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  MouseSensor,
  TouchSensor,
  useSensors,
  useSensor,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { trpc } from '@/trpc/react-provider'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import {
  usePipelineList,
  useLaneMutations,
  useTicketMutations,
  useTeamMembers,
  useInfiniteLanes,
  type InfiniteLane,
} from '@/hooks/use-pipeline'
import { DroppableContainer } from './_components/droppable-container'
import { SortableItem } from './_components/sortable-item'
import { ContainerOverlay } from './_components/container-overlay'
import { CreateLaneButton } from './_components/create-lane-button'
import { PipelineSelector } from './_components/pipeline-selector'
import { LoadMoreTrigger } from './_components/load-more-trigger'
import { Skeleton } from '@/components/ui/skeleton'
import { getPipelineStorageKey } from './pipeline-redirect'
import { LeadSheet } from '@/app/(main)/(protected)/(dashboard-layout)/leads/_components/lead-sheet'
import { permissions } from '@/lib/better-auth/permissions'
import { useFeatureGate } from '@/components/feature-gate'
import { UpgradeModal } from '@/components/upgrade-modal'
import type { PipelineTicket, PipelineLane } from '@/types/pipeline'

/**
 * Pipeline state for optimistic updates with infinite scroll
 * WHY: Tracks lanes and their tickets with pagination metadata
 */
interface PipelineState {
  id: string
  lanes: LaneState[]
}

/**
 * Lane state including ticket pagination info
 */
interface LaneState {
  id: string
  pipelineId: string
  name: string
  order: number
  color: string | null
  ticketCount: number
  /**
   * Total monetary value of ALL tickets in this lane
   * WHY: Server-calculated to ensure accuracy regardless of pagination
   * This shows the true total, not just the sum of loaded tickets
   */
  totalValue: number
  tickets: PipelineTicket[]
  hasMoreTickets: boolean
  ticketNextCursor: string | null
  createdAt: Date
  updatedAt: Date
}

interface PipelineBoardProps {
  /**
   * The ID of the pipeline to display
   * Comes from the URL parameter
   */
  pipelineId: string
}

/**
 * Main Pipeline Board component
 *
 * Displays a specific pipeline identified by pipelineId from the URL.
 * Handles saving the last viewed pipeline to localStorage for persistence.
 */
export function PipelineBoard({ pipelineId: urlPipelineId }: PipelineBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /**
   * Get ticket ID from URL search params
   * WHY: URL is the source of truth for which ticket is open
   * This enables shareable links and browser back/forward navigation
   */
  const ticketIdFromUrl = searchParams.get('ticket')

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================

  /**
   * Get active organization from hook (respects domain-first approach)
   * WHY: Single source of truth for active org and permission checking
   */
  const { activeOrganization: activeOrg, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrg?.id ?? ''
  /** Organization's currency for proper symbol display in lane values */
  const currency = activeOrg?.stripeAccountCurrency || 'usd'

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // ============================================================================

  /**
   * Check permissions for pipeline operations
   * WHY: Owners have full access, members need explicit permissions
   */
  const hasReadAccess = hasPermission(permissions.PIPELINES_READ)
  const canCreate = hasPermission(permissions.PIPELINES_CREATE)
  const canUpdate = hasPermission(permissions.PIPELINES_UPDATE)
  const canDelete = hasPermission(permissions.PIPELINES_DELETE)

  // Feature gate checks for pipelines and tickets limits
  const pipelinesGate = useFeatureGate('pipelines.limit')
  const ticketsGate = useFeatureGate('tickets.limit')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  /**
   * Pipeline list hook with server-side feature gate error handling
   * WHY: If client-side gate is bypassed, server will catch it and we show upgrade modal
   */
  const { pipelines, createPipeline, isCreating: isCreatingPipeline } = usePipelineList(
    organizationId,
    { onFeatureLimitExceeded: () => setShowUpgradeModal(true) }
  )

  /**
   * Infinite scroll for lanes - fetches lanes in pages as user scrolls horizontally
   * WHY: Optimized fetching - only load visible lanes + 1 buffer
   * Each lane includes first page of tickets (10 by default)
   */
  const {
    lanes: serverLanes,
    hasMore: hasMoreLanes,
    fetchNextPage: fetchNextLanes,
    isFetchingNextPage: isFetchingMoreLanes,
    isLoading,
    refetch: refetchLanes,
  } = useInfiniteLanes(organizationId, urlPipelineId, {
    limit: 6, // Load 6 lanes at a time (visible + 1 buffer for most screens)
    ticketLimit: 10, // Initial tickets per lane
  })

  /**
   * Save the current pipeline ID to localStorage for persistence
   * WHY: When user returns to /pipelines, we redirect them to their last viewed pipeline
   * Uses org-scoped key to support multi-tenant architecture
   */
  useEffect(() => {
    if (urlPipelineId && organizationId) {
      const storageKey = getPipelineStorageKey(organizationId)
      localStorage.setItem(storageKey, urlPipelineId)
    }
  }, [urlPipelineId, organizationId])

  /**
   * Handle pipeline selection - navigates to the new pipeline URL
   */
  const handlePipelineSelect = useCallback(
    (newPipelineId: string) => {
      router.push(`/pipelines/${newPipelineId}`)
    },
    [router]
  )

  /**
   * Handle pipeline creation - creates then navigates to the new pipeline
   */
  const handleCreatePipeline = useCallback(
    async (name: string) => {
      // Check feature gate before creating pipeline
      if (pipelinesGate?.atLimit) {
        setShowUpgradeModal(true)
        return
      }

      const newPipeline = await createPipeline(name)
      // Navigate to the newly created pipeline
      if (newPipeline?.id) {
        router.push(`/pipelines/${newPipeline.id}`)
      }
    },
    [createPipeline, router, pipelinesGate]
  )

  const laneMutations = useLaneMutations(organizationId, urlPipelineId)
  /**
   * Ticket mutations hook with server-side feature gate error handling
   * WHY: If client-side gate is bypassed, server will catch it and we show upgrade modal
   */
  const ticketMutations = useTicketMutations(organizationId, urlPipelineId, {
    onFeatureLimitExceeded: () => setShowUpgradeModal(true),
  })
  const { members } = useTeamMembers(organizationId)

  /**
   * Track which lanes are currently loading more tickets
   * WHY: Show loading state per lane during fetch
   */
  const [loadingMoreTickets, setLoadingMoreTickets] = useState<Record<string, boolean>>({})

  /**
   * tRPC utils for making direct queries
   * WHY: Needed to fetch more tickets for a specific lane
   */
  const utils = trpc.useUtils()

  // ============================================================================
  // LOCAL STATE - This is the UI source of truth
  // ============================================================================

  /**
   * Local pipeline state for optimistic updates
   * WHY: Separates UI state from server state for instant feedback
   * Stores lanes with their ticket pagination metadata
   */
  const [pipeline, setPipeline] = useState<PipelineState | null>(null)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

  /**
   * Track ticket pagination state per lane
   * WHY: When user loads more tickets, we need to track hasMore and cursor
   * Key: laneId, Value: { hasMore, cursor }
   */
  const [laneTicketPagination, setLaneTicketPagination] = useState<
    Record<string, { hasMore: boolean; cursor: string | null }>
  >({})

  /**
   * Track which lane we're creating a ticket in
   * WHY: When user clicks "Add Ticket", we show the panel in create mode
   * This stores the laneId to create the ticket in
   */
  const [createInLaneId, setCreateInLaneId] = useState<string | null>(null)

  /**
   * Lead sheet state - tracks which lead's communications sheet is open
   * WHY: When user clicks chat icon on ticket, we open lead sheet with communications tab
   * Stores just the leadId; LeadSheet fetches data internally
   */
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  /**
   * Just-created ticket - used to prevent flicker during create→edit transition
   * WHY: URL changes cause re-renders. We keep the ticket here so panel stays open
   * seamlessly while URL updates in background
   */
  const [justCreatedTicket, setJustCreatedTicket] = useState<PipelineTicket | null>(null)

  /**
   * Derive selected ticket from multiple sources (priority order):
   * 1. justCreatedTicket - for seamless create→edit transition
   * 2. URL param + pipeline data - normal edit mode
   */
  const selectedTicket = useMemo((): PipelineTicket | null => {
    // Priority 1: Just created ticket (prevents flicker)
    if (justCreatedTicket) return justCreatedTicket

    // Priority 2: From URL + pipeline data
    if (!ticketIdFromUrl || !pipeline) return null
    for (const lane of pipeline.lanes) {
      const ticket = lane.tickets.find((t) => t.id === ticketIdFromUrl)
      if (ticket) return ticket
    }
    return null
  }, [justCreatedTicket, ticketIdFromUrl, pipeline])

  // Track if we're currently dragging to prevent server sync
  const isDraggingRef = useRef(false)
  // Store snapshot for rollback on error
  const snapshotRef = useRef<PipelineState | null>(null)
  // Track original container for cross-lane detection
  const originalContainerRef = useRef<string | null>(null)
  /**
   * Ref to track when to sync from server
   * WHY: Used to avoid calling setState directly in useEffect (ESLint warning)
   * We update the ref and then trigger a controlled state update
   */
  const pendingServerSyncRef = useRef<PipelineState | null>(null)
  /**
   * Ref to store current pipeline state for use in drag handlers
   * WHY: Prevents infinite re-render loop during drag operations
   * The drag handlers need access to current state but shouldn't trigger
   * re-creation of callbacks when state changes, as that causes cascading renders
   */
  const pipelineRef = useRef<PipelineState | null>(null)
  // Keep pipelineRef in sync with pipeline state
  pipelineRef.current = pipeline

  /**
   * Sync lanes from server when not dragging
   * WHY: Transforms paginated lane data into local state format
   * Only updates if we're not in the middle of a drag operation
   */
  useEffect(() => {
    if (serverLanes.length > 0 && !isDraggingRef.current) {
      // Transform InfiniteLane[] to LaneState[]
      const transformedLanes: LaneState[] = serverLanes.map((lane) => ({
        id: lane.id,
        pipelineId: lane.pipelineId,
        name: lane.name,
        order: lane.order,
        color: lane.color,
        ticketCount: lane.ticketCount,
        /**
         * Use server-calculated total value (sum of ALL tickets in lane)
         * This is accurate regardless of how many tickets are currently loaded
         */
        totalValue: lane.totalValue,
        tickets: lane.tickets,
        hasMoreTickets: lane.hasMoreTickets,
        ticketNextCursor: lane.ticketNextCursor,
        createdAt: lane.createdAt,
        updatedAt: lane.updatedAt,
      }))

      // Initialize pagination state for each lane
      const newPaginationState: Record<string, { hasMore: boolean; cursor: string | null }> = {}
      transformedLanes.forEach((lane) => {
        newPaginationState[lane.id] = {
          hasMore: lane.hasMoreTickets,
          cursor: lane.ticketNextCursor,
        }
      })

      setPipeline((prev) => {
        // Only update if data has changed (compare lane IDs and counts)
        const prevLaneIds = prev?.lanes.map((l) => l.id).join(',')
        const newLaneIds = transformedLanes.map((l) => l.id).join(',')
        const prevTicketCounts = prev?.lanes.map((l) => l.tickets.length).join(',')
        const newTicketCounts = transformedLanes.map((l) => l.tickets.length).join(',')

        if (prevLaneIds !== newLaneIds || prevTicketCounts !== newTicketCounts) {
          return {
            id: urlPipelineId,
            lanes: transformedLanes,
          }
        }
        return prev
      })

      // Only update pagination if it's the initial load
      setLaneTicketPagination((prev) => {
        if (Object.keys(prev).length === 0) {
          return newPaginationState
        }
        // Merge new lanes' pagination (for newly loaded lanes)
        return { ...prev, ...newPaginationState }
      })
    }
  }, [serverLanes, urlPipelineId])

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  // Container IDs (lane IDs)
  const containers = useMemo(
    () => pipeline?.lanes.map((l) => l.id) ?? [],
    [pipeline?.lanes]
  )

  // Items map: laneId -> ticketIds
  const items = useMemo(() => {
    if (!pipeline) return {} as Record<string, string[]>
    return pipeline.lanes.reduce((acc, lane) => {
      acc[lane.id] = lane.tickets.map((t) => t.id)
      return acc
    }, {} as Record<string, string[]>)
  }, [pipeline])

  /**
   * Refs for containers and items - used by drag handlers to avoid re-creation
   * WHY: Drag handlers need current container/item data but including them as
   * dependencies causes handler recreation which leads to infinite render loops
   */
  const containersRef = useRef<string[]>([])
  const itemsRef = useRef<Record<string, string[]>>({})
  containersRef.current = containers
  itemsRef.current = items

  // ============================================================================
  // SENSORS
  // ============================================================================

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Find which lane contains an item
   * WHY: Uses itemsRef to avoid dependency on items, preventing handler recreation
   * This is critical for preventing infinite render loops during drag operations
   */
  const findContainer = useCallback(
    (id: UniqueIdentifier): string | undefined => {
      const currentItems = itemsRef.current
      if (id in currentItems) return id as string
      return Object.keys(currentItems).find((key) => currentItems[key].includes(id as string))
    },
    [] // No dependencies - uses ref for current data
  )

  /**
   * Collision detection for multi-container drag
   * WHY: Uses refs for containers/items to avoid recreation during drag
   * activeId is still a dependency since we need to detect when dragging starts
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const currentContainers = containersRef.current
      const currentItems = itemsRef.current

      // For lane dragging, only collide with other lanes
      if (activeId && currentContainers.includes(activeId as string)) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => currentContainers.includes(c.id as string)
          ),
        })
      }

      // For tickets, use pointer-based detection
      const pointerCollisions = pointerWithin(args)
      const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
      let overId = getFirstCollision(collisions, 'id')

      if (overId && overId in currentItems) {
        // If over a container, find closest item in it
        const containerItems = currentItems[overId as string]
        if (containerItems?.length > 0) {
          const closest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) => containerItems.includes(c.id as string)
            ),
          })
          if (closest[0]) overId = closest[0].id
        }
      }

      return overId ? [{ id: overId }] : []
    },
    [activeId] // Only depends on activeId - uses refs for containers/items
  )

  // ============================================================================
  // INFINITE SCROLL HANDLERS
  // ============================================================================

  /**
   * Load more tickets for a specific lane
   * WHY: Called when user scrolls near the bottom of a lane's ticket list
   */
  const handleLoadMoreTickets = useCallback(
    async (laneId: string) => {
      const pagination = laneTicketPagination[laneId]
      if (!pagination?.hasMore || !pagination.cursor || loadingMoreTickets[laneId]) {
        return
      }

      setLoadingMoreTickets((prev) => ({ ...prev, [laneId]: true }))

      try {
        const result = await utils.pipeline.getInfiniteTickets.fetch({
          organizationId,
          laneId,
          limit: 10,
          cursor: pagination.cursor,
        })

        // Transform and append tickets to the lane
        const newTickets = result.tickets.map((ticket) => ({
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

        // Update pipeline state with new tickets
        setPipeline((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            lanes: prev.lanes.map((lane) => {
              if (lane.id !== laneId) return lane
              // Append new tickets, avoiding duplicates
              const existingIds = new Set(lane.tickets.map((t) => t.id))
              const uniqueNewTickets = newTickets.filter((t) => !existingIds.has(t.id))
              return {
                ...lane,
                tickets: [...lane.tickets, ...uniqueNewTickets],
              }
            }),
          }
        })

        // Update pagination state
        setLaneTicketPagination((prev) => ({
          ...prev,
          [laneId]: {
            hasMore: result.hasMore,
            cursor: result.nextCursor,
          },
        }))
      } finally {
        setLoadingMoreTickets((prev) => ({ ...prev, [laneId]: false }))
      }
    },
    [organizationId, laneTicketPagination, loadingMoreTickets, utils.pipeline.getInfiniteTickets]
  )

  // ============================================================================
  // DRAG HANDLERS - Using refs to prevent infinite re-render loops
  // ============================================================================

  /**
   * Handle drag start - initialize drag state
   * WHY: Uses pipelineRef and findContainer (which uses itemsRef) to avoid
   * re-creation of this handler when state changes during drag
   */
  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    isDraggingRef.current = true
    snapshotRef.current = pipelineRef.current
    // Track original container for cross-lane detection in handleDragEnd
    originalContainerRef.current = findContainer(active.id) ?? null
    setActiveId(active.id)
  }, [findContainer]) // findContainer is stable (no deps)

  /**
   * Handle drag over - update state in real-time during drag
   * Handles: lane reordering, ticket cross-lane moves, ticket same-lane reorders
   *
   * CRITICAL: Uses refs (pipelineRef, containersRef) instead of state/derived values
   * to prevent handler recreation which causes infinite render loops when
   * setPipeline is called and changes the pipeline state
   */
  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const currentPipeline = pipelineRef.current
      const currentContainers = containersRef.current

      if (!over || !currentPipeline) return

      // ========================================
      // LANE REORDERING
      // ========================================
      if (currentContainers.includes(active.id as string)) {
        if (over.id !== active.id && currentContainers.includes(over.id as string)) {
          setPipeline((prev) => {
            if (!prev) return prev
            const oldIndex = prev.lanes.findIndex((l) => l.id === active.id)
            const newIndex = prev.lanes.findIndex((l) => l.id === over.id)
            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
            const newLanes = arrayMove([...prev.lanes], oldIndex, newIndex)
              .map((lane, i) => ({ ...lane, order: i }))
            return { ...prev, lanes: newLanes }
          })
        }
        return
      }

      // ========================================
      // TICKET OPERATIONS
      // ========================================
      const activeContainer = findContainer(active.id)
      const overContainer = findContainer(over.id)

      if (!activeContainer || !overContainer) return

      // Cross-container move
      if (activeContainer !== overContainer) {
        setPipeline((prev) => {
          if (!prev) return prev

          const activeLane = prev.lanes.find((l) => l.id === activeContainer)
          const overLane = prev.lanes.find((l) => l.id === overContainer)
          if (!activeLane || !overLane) return prev

          const activeTicket = activeLane.tickets.find((t) => t.id === active.id)
          if (!activeTicket) return prev

          /**
           * Get the ticket's value for optimistic totalValue update
           * WHY: When moving tickets between lanes, we need to update
           * the totalValue optimistically to reflect the change immediately
           */
          const ticketValue = activeTicket.value ?? 0

          // Calculate insert index with above/below detection
          const overIndex = overLane.tickets.findIndex((t) => t.id === over.id)

          let newIndex: number
          if (overIndex < 0) {
            // Dropping on empty area or container itself - append to end
            newIndex = overLane.tickets.length
          } else {
            // Dropping on a ticket - check if we're above or below its midpoint
            const overRect = over.rect
            const activeRect = active.rect.current.translated

            if (overRect && activeRect) {
              const overMidpoint = overRect.top + overRect.height / 2
              const isBelowMidpoint = activeRect.top > overMidpoint
              newIndex = isBelowMidpoint ? overIndex + 1 : overIndex
            } else {
              newIndex = overIndex
            }
          }

          return {
            ...prev,
            lanes: prev.lanes.map((lane) => {
              if (lane.id === activeContainer) {
                /**
                 * Subtract ticket value from source lane's total
                 * Also decrement ticket count for accurate display
                 */
                return {
                  ...lane,
                  tickets: lane.tickets.filter((t) => t.id !== active.id),
                  totalValue: lane.totalValue - ticketValue,
                  ticketCount: lane.ticketCount - 1,
                }
              }
              if (lane.id === overContainer) {
                /**
                 * Add ticket value to destination lane's total
                 * Also increment ticket count for accurate display
                 */
                const newTickets = [...lane.tickets]
                newTickets.splice(newIndex, 0, { ...activeTicket, laneId: lane.id })
                return {
                  ...lane,
                  tickets: newTickets,
                  totalValue: lane.totalValue + ticketValue,
                  ticketCount: lane.ticketCount + 1,
                }
              }
              return lane
            }),
          }
        })
      }
      // Same-container reorder
      else if (over.id !== active.id) {
        setPipeline((prev) => {
          if (!prev) return prev

          const lane = prev.lanes.find((l) => l.id === activeContainer)
          if (!lane) return prev

          const oldIndex = lane.tickets.findIndex((t) => t.id === active.id)
          const newIndex = lane.tickets.findIndex((t) => t.id === over.id)

          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev

          return {
            ...prev,
            lanes: prev.lanes.map((l) => {
              if (l.id !== activeContainer) return l
              const newTickets = arrayMove([...l.tickets], oldIndex, newIndex)
              return { ...l, tickets: newTickets }
            }),
          }
        })
      }
    },
    [findContainer] // findContainer is stable (uses refs internally)
  )

  /**
   * Handle drag end - persist the current state to server
   *
   * handleDragOver already updated local state in real-time,
   * so we just need to persist the final position.
   *
   * WHY: Uses refs to access current state without causing handler recreation
   */
  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      setActiveId(null)

      const currentPipeline = pipelineRef.current
      const currentContainers = containersRef.current

      if (!over || !currentPipeline) {
        isDraggingRef.current = false
        originalContainerRef.current = null
        return
      }

      // Get ORIGINAL container (where drag started)
      const originalContainer = originalContainerRef.current
      // Get CURRENT container (where item is now)
      const currentContainer = findContainer(active.id)

      if (!currentContainer) {
        isDraggingRef.current = false
        originalContainerRef.current = null
        return
      }

      // ========================================
      // LANE REORDERING
      // ========================================
      if (currentContainers.includes(active.id as string)) {
        const oldIndex = snapshotRef.current?.lanes.findIndex((l) => l.id === active.id) ?? -1
        const newIndex = currentPipeline.lanes.findIndex((l) => l.id === active.id)

        if (oldIndex !== newIndex && oldIndex >= 0) {
          // Persist to server
          try {
            const newOrder = currentPipeline.lanes.map((l) => l.id)
            await laneMutations.reorderLanes(currentPipeline.id, newOrder)
          } catch {
            if (snapshotRef.current) setPipeline(snapshotRef.current)
          }
        }

        isDraggingRef.current = false
        originalContainerRef.current = null
        return
      }

      // ========================================
      // TICKET OPERATIONS
      // ========================================

      const isCrossLaneMove = originalContainer !== null && originalContainer !== currentContainer
      const currentLane = currentPipeline.lanes.find((l) => l.id === currentContainer)
      const currentIndex = currentLane?.tickets.findIndex((t) => t.id === active.id) ?? -1

      if (isCrossLaneMove) {
        // Cross-lane move
        try {
          await ticketMutations.moveTicket({
            ticketId: active.id as string,
            targetLaneId: currentContainer,
            newOrder: currentIndex >= 0 ? currentIndex : 0,
          })
        } catch {
          if (snapshotRef.current) setPipeline(snapshotRef.current)
        }
      } else {
        // Same-lane reorder - check if position actually changed
        const originalLane = snapshotRef.current?.lanes.find((l) => l.id === currentContainer)
        const originalIndex = originalLane?.tickets.findIndex((t) => t.id === active.id) ?? -1

        if (originalIndex !== currentIndex && currentIndex >= 0) {
          try {
            const newOrder = currentLane?.tickets.map((t) => t.id) ?? []
            await ticketMutations.reorderTickets(currentContainer, newOrder)
          } catch {
            if (snapshotRef.current) setPipeline(snapshotRef.current)
          }
        }
      }

      isDraggingRef.current = false
      originalContainerRef.current = null
    },
    [findContainer, laneMutations, ticketMutations] // Only stable dependencies
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    isDraggingRef.current = false
    originalContainerRef.current = null
    if (snapshotRef.current) setPipeline(snapshotRef.current)
  }, [])

  // ============================================================================
  // TICKET HANDLERS
  // ============================================================================

  /**
   * Open ticket detail panel by updating URL
   * WHY: URL is source of truth - enables shareable links & back/forward navigation
   * The panel renders instantly because ticket data is already in memory
   */
  const handleOpenTicket = useCallback(
    (ticket: PipelineTicket) => {
      router.push(`/pipelines/${urlPipelineId}?ticket=${ticket.id}`, { scroll: false })
    },
    [router, urlPipelineId]
  )

  /**
   * Close ticket detail panel
   * WHY: Handles both edit mode (clear URL) and create mode (clear state)
   */
  const handleCloseTicket = useCallback(() => {
    // Clear justCreatedTicket if set
    if (justCreatedTicket) {
      setJustCreatedTicket(null)
    }

    if (createInLaneId) {
      setCreateInLaneId(null)
    } else {
      router.push(`/pipelines/${urlPipelineId}`, { scroll: false })
    }
  }, [router, urlPipelineId, createInLaneId, justCreatedTicket])

  /**
   * Handle ticket updates from the detail panel
   * WHY: Updates local state (instant UI) then persists to server
   * Handles both normal edits and edits to just-created tickets
   */
  const handleUpdateTicket = useCallback(
    async (data: {
      id: string
      title?: string
      description?: string | null
      assignedToId?: string | null
      leadId?: string | null
      lead?: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null; avatarUrl: string | null } | null
      deadline?: Date | null
      value?: number | null
    }) => {
      // If editing a just-created ticket, update that state too
      if (justCreatedTicket?.id === data.id) {
        setJustCreatedTicket((prev) =>
          prev
            ? {
                ...prev,
                ...(data.title !== undefined && { title: data.title }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.assignedToId !== undefined && {
                  assignedTo: data.assignedToId
                    ? members.find((m) => m.id === data.assignedToId) ?? null
                    : null,
                }),
                ...(data.lead !== undefined && { lead: data.lead }),
                ...(data.deadline !== undefined && { deadline: data.deadline }),
                ...(data.value !== undefined && { value: data.value }),
                updatedAt: new Date(),
              }
            : null
        )
      }

      // Update local pipeline state for instant feedback
      setPipeline((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lanes: prev.lanes.map((lane) => {
            // Find the ticket in this lane
            const ticket = lane.tickets.find((t) => t.id === data.id)
            if (!ticket) return lane

            /**
             * Calculate totalValue change when ticket value is updated
             * WHY: Lane header shows total value of all tickets - must update optimistically
             */
            let totalValueDelta = 0
            if (data.value !== undefined) {
              const oldValue = ticket.value ?? 0
              const newValue = data.value ?? 0
              totalValueDelta = newValue - oldValue
            }

            return {
              ...lane,
              totalValue: lane.totalValue + totalValueDelta,
              tickets: lane.tickets.map((t) =>
                t.id === data.id
                  ? {
                      ...t,
                      ...(data.title !== undefined && { title: data.title }),
                      ...(data.description !== undefined && { description: data.description }),
                      ...(data.assignedToId !== undefined && {
                        assignedTo: data.assignedToId
                          ? members.find((m) => m.id === data.assignedToId) ?? null
                          : null,
                      }),
                      ...(data.lead !== undefined && { lead: data.lead }),
                      ...(data.deadline !== undefined && { deadline: data.deadline }),
                      ...(data.value !== undefined && { value: data.value }),
                      updatedAt: new Date(),
                    }
                  : t
              ),
            }
          }),
        }
      })

      // Persist to server (only send leadId, not full lead object)
      await ticketMutations.updateTicket({
        id: data.id,
        title: data.title,
        description: data.description,
        assignedToId: data.assignedToId,
        leadId: data.leadId,
        deadline: data.deadline,
        value: data.value,
      })
    },
    [members, ticketMutations, justCreatedTicket]
  )

  /**
   * Handle description-only updates (fast path for auto-save)
   * WHY: Optimized endpoint for typing - single query, no extra includes
   * Uses updateTicketDescription which is ~2x faster than generic updateTicket
   */
  const handleUpdateTicketDescription = useCallback(
    async (ticketId: string, description: string | null) => {
      // If editing a just-created ticket, update that state too
      if (justCreatedTicket?.id === ticketId) {
        setJustCreatedTicket((prev) =>
          prev ? { ...prev, description, updatedAt: new Date() } : null
        )
      }

      // Update local pipeline state for instant feedback
      setPipeline((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lanes: prev.lanes.map((lane) => ({
            ...lane,
            tickets: lane.tickets.map((ticket) =>
              ticket.id === ticketId
                ? { ...ticket, description, updatedAt: new Date() }
                : ticket
            ),
          })),
        }
      })

      // Persist to server using fast endpoint
      await ticketMutations.updateTicketDescription(ticketId, description)
    },
    [ticketMutations, justCreatedTicket]
  )

  /**
   * Handle optimistic ticket deletion
   * WHY: Removes ticket from UI immediately for instant feedback
   * HOW: Stores snapshot for rollback, updates local state, then persists to server
   */
  const handleDeleteTicket = useCallback(
    async (ticketId: string) => {
      // Store snapshot for rollback on error
      const snapshot = pipeline

      // Optimistically remove ticket from local state
      setPipeline((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lanes: prev.lanes.map((lane) => {
            const ticketToDelete = lane.tickets.find((t) => t.id === ticketId)
            if (!ticketToDelete) return lane

            /**
             * Update lane totals when ticket is deleted
             * WHY: Keep totalValue and ticketCount accurate
             */
            const ticketValue = ticketToDelete.value ?? 0
            return {
              ...lane,
              tickets: lane.tickets.filter((t) => t.id !== ticketId),
              totalValue: lane.totalValue - ticketValue,
              ticketCount: lane.ticketCount - 1,
            }
          }),
        }
      })

      // Persist to server
      try {
        await ticketMutations.deleteTicket(ticketId)
      } catch {
        // Rollback on error
        if (snapshot) {
          setPipeline(snapshot)
        }
      }
    },
    [pipeline, ticketMutations]
  )

  /**
   * Open create ticket panel for a specific lane
   * WHY: Shows the panel in create mode so user can fill in details before creating
   * Also checks the tickets feature gate before allowing creation
   */
  const handleOpenCreateTicket = useCallback((laneId: string) => {
    // Check feature gate before opening create ticket panel
    if (ticketsGate?.atLimit) {
      setShowUpgradeModal(true)
      return
    }
    setCreateInLaneId(laneId)
  }, [ticketsGate])

  /**
   * Open lead sheet with communications tab
   * WHY: User clicked chat icon on ticket, open lead sheet to conversation
   */
  const handleOpenLeadChat = useCallback((leadId: string) => {
    setOpenLeadId(leadId)
  }, [])

  /**
   * Handle actual ticket creation from the panel
   * WHY: Called when user clicks "Create Ticket" in the panel
   * After creation, switches to edit mode so user can continue adding details
   *
   * TRULY OPTIMISTIC: Updates UI immediately with temp ID, then swaps to real ID
   * This prevents any flash or delay while waiting for server
   */
  const handleCreateNewTicket = useCallback(
    async (data: {
      laneId: string
      title: string
      description?: string | null
      assignedToId?: string | null
      deadline?: Date | null
      value?: number | null
    }) => {
      /**
       * Generate temporary ID for immediate UI update
       * WHY: We don't want to wait for server - update UI instantly
       */
      const tempId = `temp-${Date.now()}`
      const ticketValue = data.value ?? 0

      // Create the ticket object for immediate display
      const createdTicket: PipelineTicket = {
        id: tempId,
        title: data.title,
        description: data.description ?? null,
        value: data.value ?? null,
        order: 0,
        laneId: data.laneId,
        assignedTo: data.assignedToId
          ? members.find((m) => m.id === data.assignedToId) ?? null
          : null,
        lead: null,
        deadline: data.deadline ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      /**
       * STEP 1: Update ALL UI state IMMEDIATELY (before server call)
       * This is true optimistic update - no waiting for server
       */

      // Add ticket to pipeline state with temp ID
      setPipeline((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          lanes: prev.lanes.map((lane) => {
            if (lane.id !== data.laneId) return lane
            return {
              ...lane,
              totalValue: lane.totalValue + ticketValue,
              ticketCount: lane.ticketCount + 1,
              tickets: [createdTicket, ...lane.tickets],
            }
          }),
        }
      })

      // Set justCreatedTicket for panel display
      setJustCreatedTicket(createdTicket)

      // Clear create mode immediately
      setCreateInLaneId(null)

      // Update URL with temp ID (will update to real ID after server responds)
      window.history.replaceState(null, '', `/pipelines/${urlPipelineId}?ticket=${tempId}`)

      /**
       * STEP 2: Call server in background and swap temp ID with real ID
       */
      try {
        const newTicket = await ticketMutations.createTicket(data)
        trackEvent(CLARITY_EVENTS.TICKET_CREATED)

        if (newTicket?.id && newTicket.id !== tempId) {
          // Swap temp ID with real ID in pipeline state
          setPipeline((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              lanes: prev.lanes.map((lane) => ({
                ...lane,
                tickets: lane.tickets.map((t) =>
                  t.id === tempId ? { ...t, id: newTicket.id } : t
                ),
              })),
            }
          })

          // Update justCreatedTicket with real ID
          setJustCreatedTicket((prev) =>
            prev?.id === tempId ? { ...prev, id: newTicket.id } : prev
          )

          // Update URL with real ID
          window.history.replaceState(null, '', `/pipelines/${urlPipelineId}?ticket=${newTicket.id}`)
        }
      } catch {
        // On error, remove the optimistically added ticket
        setPipeline((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            lanes: prev.lanes.map((lane) => ({
              ...lane,
              tickets: lane.tickets.filter((t) => t.id !== tempId),
              totalValue: lane.tickets.some((t) => t.id === tempId)
                ? lane.totalValue - ticketValue
                : lane.totalValue,
              ticketCount: lane.tickets.some((t) => t.id === tempId)
                ? lane.ticketCount - 1
                : lane.ticketCount,
            })),
          }
        })
        setJustCreatedTicket(null)
        setCreateInLaneId(data.laneId) // Reopen create panel
        window.history.replaceState(null, '', `/pipelines/${urlPipelineId}`)
      }
    },
    [ticketMutations, urlPipelineId, members]
  )

  // ============================================================================
  // ACTIVE ITEM FOR OVERLAY
  // ============================================================================

  const activeItem = useMemo(() => {
    if (!activeId || !pipeline) return null

    const lane = pipeline.lanes.find((l) => l.id === activeId)
    if (lane) return { type: 'lane' as const, data: lane }

    for (const l of pipeline.lanes) {
      const ticket = l.tickets.find((t) => t.id === activeId)
      if (ticket) return { type: 'ticket' as const, data: ticket }
    }

    return null
  }, [activeId, pipeline])

  // ============================================================================
  // RENDER
  // ============================================================================

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoadingOrg && !activeOrg) {
    return <PipelineBoardSkeleton />
  }

  // ============================================================================
  // NO ORGANIZATION - User doesn't belong to any organization
  // ============================================================================
  if (!activeOrg) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // NO ACCESS - User doesn't have pipelines:read permission
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view pipelines
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              pipelines:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // LOADING PIPELINE DATA - Show skeleton while pipeline data is being fetched
  // ============================================================================
  if (isLoading || !organizationId) {
    return <PipelineBoardSkeleton />
  }

  if (!pipeline) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Pipeline</h1>
          <PipelineSelector
            pipelines={pipelines}
            selectedPipelineId={urlPipelineId}
            onSelect={handlePipelineSelect}
            onCreate={canCreate ? handleCreatePipeline : undefined}
            isCreating={isCreatingPipeline}
          />
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="inline-flex h-full gap-4 p-6">
            <SortableContext items={containers} strategy={horizontalListSortingStrategy}>
              {pipeline.lanes.map((lane) => (
                <DroppableContainer
                  key={lane.id}
                  id={lane.id}
                  items={items[lane.id] || []}
                  label={lane.name}
                  totalTicketCount={lane.ticketCount}
                  /**
                   * Use server-calculated total value of ALL tickets in lane
                   * WHY: This is accurate regardless of pagination - shows true total
                   */
                  totalValue={lane.totalValue}
                  currency={currency}
                  onRename={
                    canUpdate
                      ? (newName) => {
                          // Optimistic update - update local state immediately
                          setPipeline((prev) => {
                            if (!prev) return prev
                            return {
                              ...prev,
                              lanes: prev.lanes.map((l) =>
                                l.id === lane.id ? { ...l, name: newName } : l
                              ),
                            }
                          })
                          // Persist to server in background
                          laneMutations.updateLane({ id: lane.id, name: newName })
                        }
                      : undefined
                  }
                  onDelete={canDelete ? () => laneMutations.deleteLane(lane.id) : undefined}
                  onAddTicket={canCreate ? () => handleOpenCreateTicket(lane.id) : undefined}
                  hasMoreTickets={laneTicketPagination[lane.id]?.hasMore ?? false}
                  onLoadMoreTickets={() => handleLoadMoreTickets(lane.id)}
                  isLoadingMoreTickets={loadingMoreTickets[lane.id] ?? false}
                >
                  <SortableContext
                    items={items[lane.id] || []}
                    strategy={verticalListSortingStrategy}
                  >
                    {lane.tickets.map((ticket) => (
                      <SortableItem
                        key={ticket.id}
                        id={ticket.id}
                        ticket={ticket}
                        disabled={containers.includes(activeId as string) || !canUpdate}
                        onDelete={canDelete ? handleDeleteTicket : undefined}
                        onEdit={() => handleOpenTicket(ticket)}
                        onOpenChat={handleOpenLeadChat}
                      />
                    ))}
                  </SortableContext>
                </DroppableContainer>
              ))}
            </SortableContext>

            {/* Load More Lanes Trigger - for horizontal infinite scroll */}
            <LoadMoreTrigger
              onLoadMore={fetchNextLanes}
              hasMore={hasMoreLanes}
              isLoading={isFetchingMoreLanes}
              direction="horizontal"
              rootMargin="200px"
              className="shrink-0 w-20"
            />

            {/* Only show create lane button if user has create permission */}
            {canCreate && (
              <CreateLaneButton
                onCreateLane={async (input) => {
                  await laneMutations.createLane({ ...input, pipelineId: pipeline.id })
                }}
              />
            )}
          </div>

          {typeof document !== 'undefined' &&
            createPortal(
              <DragOverlay>
                {activeItem?.type === 'lane' && (
                  <ContainerOverlay lane={activeItem.data as PipelineLane} currency={currency} />
                )}
                {activeItem?.type === 'ticket' && (
                  <SortableItem
                    id={activeItem.data.id}
                    ticket={activeItem.data as PipelineTicket}
                    isOverlay
                  />
                )}
              </DragOverlay>,
              document.body
            )}

        </DndContext>
      </div>

      {/* Ticket Detail Panel - Edit mode takes priority over Create mode
          WHY: When transitioning from create to edit (after ticket creation),
          we want the edit panel to show immediately without any close/reopen flash.
          selectedTicket becomes truthy via justCreatedTicket before createInLaneId clears.

          PERMISSIONS:
          - Edit mode: Pass canUpdate to control if fields are editable
          - Create mode: Only shown if canCreate is true (checked at source) */}
      {selectedTicket ? (
        <TicketDetailPanel
          mode="edit"
          ticket={selectedTicket}
          organizationId={organizationId}
          members={members}
          onClose={handleCloseTicket}
          onUpdate={canUpdate ? handleUpdateTicket : undefined}
          onUpdateDescription={canUpdate ? handleUpdateTicketDescription : undefined}
        />
      ) : createInLaneId && canCreate ? (
        <TicketDetailPanel
          mode="create"
          laneId={createInLaneId}
          organizationId={organizationId}
          members={members}
          onClose={handleCloseTicket}
          onCreate={handleCreateNewTicket}
        />
      ) : null}

      {/* Lead Sheet - Communications tab for quick lead conversations
          WHY: When user clicks chat icon on ticket, opens lead sheet with communications
          Uses leadId mode - LeadViewer fetches data internally
          NOTE: LeadViewer is self-contained, handles all mutations internally */}
      {openLeadId && (
        <LeadSheet
          leadId={openLeadId}
          organizationId={organizationId}
          open={!!openLeadId}
          onOpenChange={(open) => !open && setOpenLeadId(null)}
          defaultTab="communications"
        />
      )}

      {/* Upgrade Modal - shown when pipeline or ticket limits are reached */}
      {organizationId && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          organizationId={organizationId}
        />
      )}
    </div>
  )
}

function PipelineBoardSkeleton() {
  return (
    <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
      <div className="inline-flex h-full gap-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shrink-0 w-80 h-full bg-muted/30 rounded-xl p-4 space-y-3">
            <Skeleton className="h-6 w-24" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
