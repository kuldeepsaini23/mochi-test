/**
 * Integration Modal Component
 *
 * Shows integration details and handles OAuth connection flow.
 *
 * REFACTOR: Uses useActiveOrganization hook for permission checking
 * instead of the standalone usePermission hook. This ensures
 * permission checks respect the subdomain/custom domain context.
 */

'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Integration } from '@/types/integration'
import { getIntegrationById } from '@/constants/integrations'
import { Check, ExternalLink } from 'lucide-react'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

interface IntegrationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integration: Integration
  organizationId: string
}

export function IntegrationModal({
  open,
  onOpenChange,
  integration,
  organizationId,
}: IntegrationModalProps) {
  // Get full integration details from constants
  const integrationDetails = getIntegrationById(integration.id)

  /**
   * Permission check for integration updates.
   * Uses hasPermission from useActiveOrganization hook which respects
   * the subdomain/custom domain context for multi-tenant support.
   */
  const { hasPermission } = useActiveOrganization()
  const canUpdateIntegrations = hasPermission(permissions.INTEGRATIONS_UPDATE)

  const utils = trpc.useUtils()

  // Get OAuth URL mutation (for Standard accounts)
  const getOAuthUrl = trpc.integrations.getStripeOAuthUrl.useMutation({
    onSuccess: (data) => {
      // Redirect to Stripe OAuth page
      window.location.href = data.url
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Stripe'
      toast.error(errorMessage)
    },
  })

  if (!integrationDetails) {
    return null
  }

  // Handle connect button click
  const handleConnect = async () => {
    if (integration.id === 'stripe-connect') {
      // Get OAuth URL and redirect
      getOAuthUrl.mutate({ organizationId })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect {integration.name}</DialogTitle>
          <DialogDescription>{integration.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <h4 className="font-semibold mb-3">Benefits:</h4>
            <ul className="space-y-2">
              {integrationDetails.benefits.map((benefit, index) => (
                <li key={index} className="flex items-start">
                  <Check className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              You'll be redirected to Stripe to connect your account. After connecting, you'll be
              brought back here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={getOAuthUrl.isPending}
          >
            Cancel
          </Button>
          {canUpdateIntegrations && (
            <Button onClick={handleConnect} disabled={getOAuthUrl.isPending}>
              {getOAuthUrl.isPending ? (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Redirecting...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect with Stripe
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
