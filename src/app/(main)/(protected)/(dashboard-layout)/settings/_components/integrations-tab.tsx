'use client'

/**
 * Integrations Tab Component - Active Organization Pattern
 *
 * WHY: Display and manage third-party integrations within settings
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSION: Requires integrations:read to view
 */

import { useState, useEffect } from 'react'
import { trpc } from '@/trpc/react-provider'
import { IntegrationCard } from '@/components/integrations/integration-card'
import { IntegrationModal } from '@/components/integrations/integration-modal'
import { IntegrationsSkeleton } from '@/components/integrations/integrations-skeleton'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import type { Integration } from '@/types/integration'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'

export function IntegrationsTab() {
  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const searchParams = useSearchParams()

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.INTEGRATIONS_READ)

  /**
   * Fetch integrations using tRPC with aggressive caching
   * WHY: Enables instant re-navigation without refetching
   */
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = trpc.integrations.getIntegrations.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && hasAccess,
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  )

  /**
   * Handle OAuth callback messages
   * WHY: Provides feedback after OAuth redirect
   */
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success) {
      toast.success(success)
      // Clear query params
      window.history.replaceState({}, '', '/settings/integrations')
      // Refetch integrations to update connection status
      refetch()
    }

    if (error) {
      toast.error(error)
      // Clear query params
      window.history.replaceState({}, '', '/settings/integrations')
    }
  }, [searchParams, refetch])

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration)
    setModalOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setModalOpen(open)
    if (!open) {
      // Reset selected integration when modal closes
      setTimeout(() => setSelectedIntegration(null), 300)
    }
  }

  // Show skeleton while loading organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <IntegrationsSkeleton />
  }

  // No organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Permission denied state
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view integrations
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              integrations:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // Show skeleton while loading integrations (only on initial load)
  if (isLoading && !data) {
    return <IntegrationsSkeleton />
  }

  // Error state (only show if no cached data)
  if (isError && !data) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
        Failed to load integrations. Please try again later.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Description */}
        <p className="text-sm text-muted-foreground">
          Connect third-party services to enhance your studio capabilities and automate workflows
        </p>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              organizationId={organizationId}
              onConnect={() => handleConnect(integration)}
            />
          ))}
        </div>
      </div>

      {/* Connection Modal */}
      {selectedIntegration && (
        <IntegrationModal
          open={modalOpen}
          onOpenChange={handleModalClose}
          integration={selectedIntegration}
          organizationId={organizationId}
        />
      )}
    </>
  )
}
