'use client'

/**
 * PipelineRedirect Component - Handles pipeline routing logic
 *
 * This component redirects users to the appropriate pipeline:
 * 1. If localStorage has a saved pipeline ID, redirect to that pipeline
 * 2. Otherwise, fetch the default pipeline and redirect to it
 *
 * WHY: Centralizes the redirect logic in a client component since
 * localStorage is only available on the client side.
 *
 * SOURCE OF TRUTH: Pipeline URL routing, localStorage key 'lastViewedPipelineId'
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Base localStorage key for storing the last viewed pipeline ID
 * WHY: Scoped by organization ID to support multi-tenant architecture
 * Each org has its own "last viewed pipeline" preference
 *
 * Usage: getPipelineStorageKey(organizationId) returns 'lastViewedPipelineId_{orgId}'
 *
 * SOURCE OF TRUTH: Pipeline localStorage key pattern
 */
export const LAST_PIPELINE_STORAGE_KEY_BASE = 'lastViewedPipelineId'

/**
 * Get the organization-scoped localStorage key for last viewed pipeline
 * WHY: Multi-tenant support - each org remembers its own last viewed pipeline
 * Prevents cross-org pipeline references when switching organizations
 *
 * @param organizationId - The current organization's ID
 * @returns Scoped key like 'lastViewedPipelineId_org123'
 */
export function getPipelineStorageKey(organizationId: string): string {
  return `${LAST_PIPELINE_STORAGE_KEY_BASE}_${organizationId}`
}

export function PipelineRedirect() {
  const router = useRouter()
  const [isRedirecting, setIsRedirecting] = useState(true)

  /**
   * Get the active organization using the proper hook
   * Respects domain-first approach for multi-tenant support
   */
  const { activeOrganization: activeOrg, isLoading: orgsLoading } = useActiveOrganization()
  const organizationId = activeOrg?.id ?? ''

  /**
   * Fetch pipelines list to validate the stored ID exists
   */
  const { data: pipelines, isLoading: pipelinesLoading } = trpc.pipeline.list.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      staleTime: 60000,
    }
  )

  /**
   * Fetch or create default pipeline (fallback if no stored ID)
   */
  const { data: defaultPipeline, isLoading: defaultLoading } = trpc.pipeline.getOrCreate.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      staleTime: 30000,
    }
  )

  /**
   * Handle redirect once data is loaded
   * WHY: Uses org-scoped localStorage key to prevent cross-org pipeline references
   */
  useEffect(() => {
    // Wait for all data to load
    if (orgsLoading || pipelinesLoading || defaultLoading) return
    if (!organizationId) return

    // Check localStorage for last viewed pipeline (scoped by organization)
    const storageKey = getPipelineStorageKey(organizationId)
    const storedPipelineId = localStorage.getItem(storageKey)

    if (storedPipelineId && pipelines) {
      // Validate the stored pipeline still exists in this org
      const pipelineExists = pipelines.some((p) => p.id === storedPipelineId)

      if (pipelineExists) {
        router.replace(`/pipelines/${storedPipelineId}`)
        return
      }
    }

    // Fallback to default pipeline
    if (defaultPipeline) {
      // Save this as the last viewed pipeline for this org
      localStorage.setItem(storageKey, defaultPipeline.id)
      router.replace(`/pipelines/${defaultPipeline.id}`)
      return
    }

    // No pipeline available - stay on loading state
    setIsRedirecting(false)
  }, [
    orgsLoading,
    pipelinesLoading,
    defaultLoading,
    organizationId,
    pipelines,
    defaultPipeline,
    router,
  ])

  /**
   * Show loading skeleton while determining redirect
   */
  if (isRedirecting || orgsLoading || pipelinesLoading) {
    return <PipelineRedirectSkeleton />
  }

  /**
   * Edge case: No organization or pipeline available
   */
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">No pipelines available</p>
    </div>
  )
}

/**
 * Loading skeleton that matches the pipeline board layout
 */
function PipelineRedirectSkeleton() {
  return (
    <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95">
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
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
