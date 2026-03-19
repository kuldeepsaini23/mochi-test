/**
 * Integration Card Component
 *
 * Displays a single integration with connection status and actions.
 *
 * REFACTOR: Uses useActiveOrganization hook for permission checking
 * instead of the standalone usePermission hook. This ensures
 * permission checks respect the subdomain/custom domain context.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Integration } from '@/types/integration'
import { Lock } from 'lucide-react'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

interface IntegrationCardProps {
  integration: Integration
  organizationId: string
  onConnect: () => void
}

export function IntegrationCard({
  integration,
  organizationId,
  onConnect,
}: IntegrationCardProps) {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  const isConnected = integration.status === 'connected'

  /**
   * RBAC: Check if user has integrations:update permission.
   * WHY: Only allow connect/disconnect if user has this permission.
   * This is critical because dashboard shows sensitive financial data.
   *
   * Uses hasPermission from useActiveOrganization hook which respects
   * the subdomain/custom domain context for multi-tenant support.
   */
  const { hasPermission } = useActiveOrganization()
  const canUpdateIntegrations = hasPermission(permissions.INTEGRATIONS_UPDATE)

  const utils = trpc.useUtils()

  // Disconnect mutation with optimistic updates
  const disconnectMutation =
    trpc.integrations.disconnectStandardAccount.useMutation({
      onMutate: async () => {
        // Cancel ongoing queries to prevent overwriting optimistic update
        await utils.integrations.getIntegrations.cancel({ organizationId })

        // Save current data for rollback
        const previousIntegrations = utils.integrations.getIntegrations.getData(
          {
            organizationId,
          }
        )

        // Optimistically update UI - set status to disconnected
        utils.integrations.getIntegrations.setData(
          { organizationId },
          (old) => {
            if (!old) return old
            return {
              ...old,
              integrations: old.integrations.map((int) =>
                int.id === integration.id
                  ? { ...int, status: 'disconnected' as const }
                  : int
              ),
            }
          }
        )

        return { previousIntegrations }
      },
      onError: (err, variables, context) => {
        // Rollback on error
        if (context?.previousIntegrations) {
          utils.integrations.getIntegrations.setData(
            { organizationId },
            context.previousIntegrations
          )
        }

        // Handle structured errors
        const errorData =
          err && typeof err === 'object' && 'data' in err ? err.data : null
        const errorCause =
          errorData &&
          typeof errorData === 'object' &&
          'cause' in errorData &&
          errorData.cause &&
          typeof errorData.cause === 'object'
            ? errorData.cause
            : null

        if (
          errorCause &&
          'errorCode' in errorCause &&
          errorCause.errorCode === 'INSUFFICIENT_PERMISSIONS'
        ) {
          toast.error("You don't have permission to disconnect integrations", {
            description:
              'Contact your organization owner to grant you the integrations:update permission.',
          })
        } else if (
          errorCause &&
          'message' in errorCause &&
          typeof errorCause.message === 'string'
        ) {
          toast.error(errorCause.message || 'Failed to disconnect integration')
        } else {
          toast.error('Failed to disconnect integration')
        }
      },
      onSuccess: () => {
        toast.success(`${integration.name} has been disconnected`)
        setShowDisconnectDialog(false)
      },
      onSettled: () => {
        // Always refetch after mutation (success or error) to sync with server
        utils.integrations.getIntegrations.invalidate({ organizationId })
      },
    })

  const handleSwitchChange = (checked: boolean) => {
    if (!canUpdateIntegrations) return

    if (checked) {
      // User wants to connect - show the modal
      onConnect()
    } else {
      // User wants to disconnect - show confirmation dialog
      setShowDisconnectDialog(true)
    }
  }

  const handleConfirmDisconnect = () => {
    disconnectMutation.mutate({ organizationId })
  }

  return (
    <>
      <Card className="relative overflow-hidden border-border/50 hover:border-border bg-muted transition-colors">
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between">
            {/* Logo - Full bleed, no padding */}
            <div className="w-14 h-14 relative rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 border border-border/50">
              <Image
                src={integration.logo}
                alt={`${integration.name} logo`}
                fill
                className="object-cover"
              />
            </div>

            {/* Toggle Switch / Status Badge in top right */}
            {canUpdateIntegrations ? (
              <Switch
                checked={isConnected}
                onCheckedChange={handleSwitchChange}
                disabled={disconnectMutation.isPending}
                aria-label={
                  isConnected ? 'Disconnect integration' : 'Connect integration'
                }
              />
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" />
                Owner Only
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <CardTitle className="text-base font-semibold">
              {integration.name}
            </CardTitle>
            <CardDescription className="text-sm line-clamp-2">
              {integration.description}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {integration.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection to your {integration.name}{' '}
              account. You will need to reconnect and complete the onboarding
              process again if you want to use this integration in the future.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              className="bg-destructive hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
