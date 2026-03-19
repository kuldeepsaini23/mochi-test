/**
 * ============================================================================
 * AUTOMATION BUILDER WRAPPER
 * ============================================================================
 *
 * Client component wrapper for the AutomationBuilder.
 * Handles loading automation data from database and save mutations.
 *
 * WHY THIS EXISTS:
 * - AutomationBuilder is a pure UI component
 * - This wrapper connects the UI to the data layer (tRPC)
 * - Separation of concerns: UI logic vs data fetching
 *
 * AUTOSAVE:
 * - Debouncing is handled by useAutoSave hook in navbar (2 second delay)
 * - This wrapper provides async handleSave that navbar awaits for spinner UI
 * - Uses tRPC automations.update for persistence
 *
 * SOURCE OF TRUTH: Automation, AutomationBuilderTypes
 */

'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AutomationBuilder } from '@/components/automation-builder'
import { trpc } from '@/trpc/react-provider'
import type { Automation, AutomationStatus, AutomationSchema } from '@/components/automation-builder/_lib/types'
import { START_NODE_ID } from '@/components/automation-builder/_lib/types'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface AutomationBuilderWrapperProps {
  organizationId: string
  /** URL slug for the automation (unique per organization) */
  slug: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Prisma status (UPPER_CASE) to UI status (lower_case).
 */
function prismaToUiStatus(status: string): AutomationStatus {
  return status.toLowerCase() as AutomationStatus
}

/**
 * Convert UI status (lower_case) to Prisma status (UPPER_CASE).
 */
function uiToPrismaStatus(status: AutomationStatus): string {
  return status.toUpperCase()
}

/**
 * Convert Prisma trigger type (UPPER_SNAKE_CASE) to UI trigger type (snake_case).
 */
function prismaToUiTriggerType(triggerType: string): string {
  return triggerType.toLowerCase()
}

/**
 * Convert UI trigger type (snake_case) to Prisma trigger type (UPPER_SNAKE_CASE).
 */
function uiToPrismaTriggerType(triggerType: string): string {
  return triggerType.toUpperCase()
}

/**
 * Extract trigger type from automation schema.
 *
 * v2 (Start node): Finds trigger nodes connected to Start's "triggers" handle,
 * returns the first trigger's type for the DB column.
 * v1 fallback: Finds any trigger node directly.
 *
 * Returns undefined if no trigger node found.
 */
function extractTriggerTypeFromSchema(schema: AutomationSchema): string | undefined {
  // v2: Find trigger nodes connected to the Start node's triggers handle
  const startNode = schema.nodes.find((n) => n.id === START_NODE_ID)
  if (startNode) {
    const triggerEdges = schema.edges.filter(
      (e) => e.target === START_NODE_ID && e.targetHandle === 'triggers'
    )
    const triggerNodeIds = new Set(triggerEdges.map((e) => e.source))
    const triggerNodes = schema.nodes.filter(
      (n) => triggerNodeIds.has(n.id) && n.type === 'trigger'
    )

    // Return first trigger's type for the DB column (primary trigger)
    const firstTrigger = triggerNodes[0]
    if (firstTrigger) {
      return (firstTrigger.data as { triggerType?: string })?.triggerType
    }
  }

  // v1 fallback: find any trigger node
  const triggerNode = schema.nodes.find((n) => n.type === 'trigger')
  if (!triggerNode) return undefined

  return (triggerNode.data as { triggerType?: string })?.triggerType
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AutomationBuilderWrapper({
  organizationId,
  slug,
}: AutomationBuilderWrapperProps) {
  const router = useRouter()

  /**
   * tRPC utils for cache invalidation after save.
   * WHY: Without invalidation, navigating away and back loads stale cached
   * data. Combined with auto-save firing on load, this caused the stale data
   * to overwrite the user's real data in the database.
   */
  const utils = trpc.useUtils()

  /**
   * Fetch automation data from database by slug.
   * Slug is unique per organization, so this returns a single automation.
   */
  const {
    data: automationData,
    isLoading,
    error,
  } = trpc.automation.getBySlug.useQuery(
    { organizationId, slug },
    { enabled: !!organizationId && !!slug }
  )

  /**
   * Update mutation for saving changes.
   * On success, invalidates the getBySlug query cache so that
   * navigating away and back fetches fresh data from the server
   * instead of using stale cached data.
   */
  const updateMutation = trpc.automation.update.useMutation({
    onSuccess: () => {
      /**
       * Invalidate the cached query for this automation so the next
       * time the user navigates to this page, they get fresh data.
       * This prevents the stale-data-overwrite bug where auto-save
       * would fire on load with outdated cached data.
       */
      utils.automation.getBySlug.invalidate({ organizationId, slug })
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  /**
   * Status update mutation.
   */
  const updateStatusMutation = trpc.automation.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Status updated')
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`)
    },
  })

  /**
   * Slug update mutation.
   * On success, redirects to new URL with updated slug.
   */
  const updateSlugMutation = trpc.automation.updateSlug.useMutation({
    onSuccess: (data) => {
      toast.success('Slug updated')
      // Redirect to new URL with updated slug
      if (data.slug && data.slug !== slug) {
        router.push(`/automations/${data.slug}/edit`)
      }
    },
    onError: (error) => {
      toast.error(`Failed to update slug: ${error.message}`)
    },
  })

  /**
   * Transform Prisma data to UI format.
   */
  const initialAutomation = useMemo((): Automation | null => {
    if (!automationData) return null

    // Parse schema from Prisma JSON, with safe defaults for missing properties
    const rawSchema = automationData.schema as Record<string, unknown> | null | undefined
    const schema: AutomationSchema = {
      nodes: Array.isArray(rawSchema?.nodes) ? rawSchema.nodes as AutomationSchema['nodes'] : [],
      edges: Array.isArray(rawSchema?.edges) ? rawSchema.edges as AutomationSchema['edges'] : [],
      version: typeof rawSchema?.version === 'number' ? rawSchema.version : undefined,
    }

    return {
      id: automationData.id,
      organizationId: automationData.organizationId,
      name: automationData.name,
      description: automationData.description ?? undefined,
      status: prismaToUiStatus(automationData.status),
      triggerType: prismaToUiTriggerType(automationData.triggerType),
      schema,
      createdAt: automationData.createdAt,
      updatedAt: automationData.updatedAt,
    }
  }, [automationData])

  /**
   * Save handler for the automation.
   * Uses mutateAsync so the caller can await the save (for spinner UI).
   * Note: Debouncing is handled by useAutoSave hook in navbar (2 second delay).
   *
   * IMPORTANT: Also extracts and saves the triggerType from the schema.
   * This ensures the automation's triggerType matches the trigger node,
   * which is required for automations to fire on the correct events.
   */
  const handleSave = useCallback(
    async (automation: Automation) => {
      // Extract trigger type from schema to keep in sync with trigger node
      const triggerType = extractTriggerTypeFromSchema(automation.schema)

      // Build update data, casting triggerType to the expected Prisma enum type.
      // APPOINTMENT_STARTED kept for backward compat — deprecated from UI, use wait_for_event instead.
      type PrismaTriggerType = 'FORM_SUBMITTED' | 'PIPELINE_TICKET_MOVED' | 'PAYMENT_COMPLETED' | 'APPOINTMENT_SCHEDULED' | 'APPOINTMENT_STARTED'

      await updateMutation.mutateAsync({
        organizationId,
        automationId: automation.id,
        name: automation.name,
        description: automation.description ?? null,
        schema: automation.schema,
        // Include triggerType if found (converted to UPPER_CASE for Prisma)
        ...(triggerType && { triggerType: uiToPrismaTriggerType(triggerType) as PrismaTriggerType }),
      })
    },
    [organizationId, updateMutation]
  )

  /**
   * Status change handler for the automation.
   * Changes status between active, paused, draft, archived.
   */
  const handleStatusChange = useCallback(
    async (status: AutomationStatus) => {
      if (!automationData) return

      // Cast to Prisma status enum type
      type PrismaStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'

      await updateStatusMutation.mutateAsync({
        organizationId,
        automationId: automationData.id,
        status: uiToPrismaStatus(status) as PrismaStatus,
      })
    },
    [organizationId, automationData, updateStatusMutation]
  )

  /**
   * Slug change handler for the automation.
   * Updates the slug and redirects to new URL on success.
   */
  const handleSlugChange = useCallback(
    async (newSlug: string) => {
      if (!automationData) return

      await updateSlugMutation.mutateAsync({
        organizationId,
        automationId: automationData.id,
        slug: newSlug,
      })
    },
    [organizationId, automationData, updateSlugMutation]
  )

  /**
   * Close handler to navigate back to automations list.
   */
  const handleClose = useCallback(() => {
    router.push('/automations')
  }, [router])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading automation...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-sm text-destructive">Failed to load automation</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
          <button
            onClick={() => router.push('/automations')}
            className="text-sm text-primary hover:underline"
          >
            Back to automations
          </button>
        </div>
      </div>
    )
  }

  // Not found state
  if (!initialAutomation || !automationData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Automation not found</p>
          <button
            onClick={() => router.push('/automations')}
            className="text-sm text-primary hover:underline"
          >
            Back to automations
          </button>
        </div>
      </div>
    )
  }

  return (
    <AutomationBuilder
      organizationId={organizationId}
      automationId={automationData.id}
      slug={slug}
      initialAutomation={initialAutomation}
      onSave={handleSave}
      onStatusChange={handleStatusChange}
      onSlugChange={handleSlugChange}
      onClose={handleClose}
    />
  )
}
