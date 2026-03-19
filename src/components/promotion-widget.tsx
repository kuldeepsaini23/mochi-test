'use client'

/**
 * Promotion Widget Component
 *
 * WHY: Encourage free tier users to upgrade and book onboarding calls
 * HOW: Shows in sidebar footer for free tier users only
 * WHEN: Displays when user's organization has a 'free' plan
 *
 * REFACTOR: Uses useActiveOrganization hook as single source of truth
 * instead of manually determining active org from organizations list.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { UpgradeModal } from './upgrade-modal'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useActiveOrganization } from '@/hooks/use-active-organization'

export function PromotionWidget() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { state } = useSidebar()

  /**
   * Get the active organization using the single source of truth hook.
   * WHY: This respects subdomain/custom domain context instead of
   * manually picking first org or owner org from a list.
   */
  const { activeOrganization: activeOrg, isLoading: isLoadingOrg } = useActiveOrganization()

  /**
   * Get organization tier to check if user is on free plan or trial.
   * Uses cached data from layout prefetch for instant rendering.
   */
  const { data: tierData } = trpc.usage.getTier.useQuery(
    { organizationId: activeOrg?.id ?? '' },
    {
      enabled: !!activeOrg?.id,
      staleTime: 0, // Allow fresh data on navigation
      gcTime: 1000 * 60 * 30, // 30 minutes cache
    }
  )

  // Show for free tier users OR users on a trial period
  const shouldShowWidget = tierData?.tier === 'free' || tierData?.isOnTrial

  // Don't render while loading or if no org/widget conditions not met
  if (isLoadingOrg || !shouldShowWidget || !activeOrg) {
    return null
  }

  const isFreeTier = tierData?.tier === 'free'
  const isTrial = tierData?.isOnTrial
  const isCollapsed = state === 'collapsed'

  return (
    <>
      {isCollapsed ? (
        // Collapsed state - just show icon button with tooltip
        <SidebarMenu>
          <SidebarMenuItem>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    onClick={() => setShowUpgradeModal(true)}
                    className="h-9"
                  >
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  <span>{isTrial ? 'Complete Upgrade' : 'Upgrade Plan'}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : (
        // Expanded state - show full widget
        <div className="border border-border/40 rounded-lg bg-muted/30 p-3">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="text-xs font-medium text-foreground/80 leading-tight">
                  {isTrial ? 'Complete Your Upgrade' : 'Get Setup Help'}
                </p>
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                  {isTrial
                    ? 'Subscribe to keep your features after trial ends'
                    : 'Free consultation with our team to help you get started'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowUpgradeModal(true)}
              variant="outline"
              size="sm"
              className="w-full h-7 text-[11px] font-normal border-border/50 hover:bg-accent/50"
            >
              {isTrial ? 'View Plans' : 'Upgrade Plan'}
            </Button>
          </div>
        </div>
      )}

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        organizationId={activeOrg.id}
      />
    </>
  )
}
