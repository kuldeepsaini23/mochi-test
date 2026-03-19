'use client'

/**
 * PipelineNavLink - Smart navigation link for pipelines
 *
 * This component provides instant navigation to the last viewed pipeline
 * without requiring a redirect through /pipelines.
 *
 * HOW IT WORKS:
 * 1. On mount, reads the last viewed pipeline ID from localStorage (scoped by org)
 * 2. Computes the correct href (/pipelines/{id} or /pipelines)
 * 3. Navigates directly to the correct pipeline
 *
 * WHY: Avoids the loading state flash from /pipelines -> /pipelines/{id} redirect
 * Uses org-scoped localStorage key to support multi-tenant architecture
 *
 * SOURCE OF TRUTH: localStorage key 'lastViewedPipelineId_{orgId}'
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { getPipelineStorageKey } from './pipeline-redirect'

interface PipelineNavLinkProps {
  children: React.ReactNode
  className?: string
}

/**
 * Hook to get the correct pipeline URL from localStorage
 * Returns the URL and a navigation handler
 * Uses org-scoped localStorage key for multi-tenant support
 */
export function usePipelineNavigation() {
  const router = useRouter()
  const [pipelineId, setPipelineId] = useState<string | null>(null)

  /**
   * Get active organization for scoped localStorage key
   * WHY: Each org has its own "last viewed pipeline" preference
   */
  const { activeOrganization: activeOrg } = useActiveOrganization()
  const organizationId = activeOrg?.id ?? ''

  /**
   * Read the stored pipeline ID after mount (client-side only)
   * WHY: Uses org-scoped key to prevent cross-org pipeline references
   */
  useEffect(() => {
    if (!organizationId) {
      setPipelineId(null)
      return
    }

    const storageKey = getPipelineStorageKey(organizationId)
    const storedId = localStorage.getItem(storageKey)
    setPipelineId(storedId)
  }, [organizationId])

  /**
   * Computed href - uses stored ID if available
   */
  const href = pipelineId ? `/pipelines/${pipelineId}` : '/pipelines'

  /**
   * Navigation handler for onClick
   * Reads localStorage at click time to ensure freshest value
   * Uses org-scoped key to prevent cross-org pipeline references
   */
  const handleNavigate = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault()

      // If no org yet, just go to /pipelines base route
      if (!organizationId) {
        router.push('/pipelines')
        return
      }

      // Read fresh value from localStorage at click time (org-scoped)
      const storageKey = getPipelineStorageKey(organizationId)
      const storedId = localStorage.getItem(storageKey)
      const targetUrl = storedId ? `/pipelines/${storedId}` : '/pipelines'

      router.push(targetUrl)
    },
    [router, organizationId]
  )

  return { href, pipelineId, handleNavigate }
}

/**
 * PipelineNavLink - Renders a link that navigates to the correct pipeline
 *
 * Use this in the sidebar instead of a static Link for pipelines.
 */
export function PipelineNavLink({ children, className }: PipelineNavLinkProps) {
  const { href, handleNavigate } = usePipelineNavigation()

  return (
    <a
      href={href}
      onClick={handleNavigate}
      className={className}
    >
      {children}
    </a>
  )
}
