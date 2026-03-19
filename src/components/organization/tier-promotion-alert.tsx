'use client'

/**
 * Tier Promotion Alert Component
 *
 * WHY: Display dynamic upgrade messages based on current tier and feature limits
 * HOW: Fetches tier data and usage metrics to show contextual upgrade prompts
 *
 * FEATURES:
 * - Shows different messages for tier 1 vs tier 2+ users
 * - Pulls all text from feature gate source of truth
 * - Displays usage percentage and limits
 * - Opens unified upgrade modal on click
 *
 * B2B MODEL: Platform → Organizations
 */

import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { FEATURES, PLANS, getNextPlan, type PlanKey, type FeatureKey } from '@/lib/config/feature-gates'
import { Skeleton } from '@/components/ui/skeleton'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useState } from 'react'

interface TierPromotionAlertProps {
  organizationId: string
  featureKey: FeatureKey
}

export function TierPromotionAlert({
  organizationId,
  featureKey,
}: TierPromotionAlertProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // Fetch tier information
  const { data: tierData, isLoading: isTierLoading } = trpc.usage.getTier.useQuery(
    { organizationId },
    { staleTime: Infinity }
  )

  // Fetch usage metrics
  const { data: usageMetrics, isLoading: isUsageLoading } = trpc.usage.getUsageMetrics.useQuery(
    { organizationId },
    { staleTime: 60000 }
  )

  const isLoading = isTierLoading || isUsageLoading

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!tierData || !usageMetrics) {
    return null
  }

  const currentPlanKey = tierData.tier as PlanKey
  const currentPlan = PLANS[currentPlanKey]
  const nextPlanKey = getNextPlan(currentPlanKey)

  // Don't show alert if already at highest tier
  if (!nextPlanKey) {
    return null
  }

  const nextPlan = PLANS[nextPlanKey]
  const feature = FEATURES.organization[featureKey]

  // Get usage data for this feature
  const usage = usageMetrics[featureKey]
  const currentUsage = usage?.currentUsage || 0
  const limit = usage?.limit ?? 0
  const percentage = usage?.percentage ?? 0

  // Don't show alert if feature is unlimited (-1)
  if (limit === -1) {
    return null
  }

  // Determine which message to show based on tier
  // Tier 1 = free tier, Tier 2+ = starter and above
  const isTier1 = currentPlanKey === 'free'

  // Get the appropriate message from feature config
  let message = ''
  if ('upgradeMessageTier1' in feature && 'upgradeMessageTier2Plus' in feature) {
    message = isTier1
      ? feature.upgradeMessageTier1
      : feature.upgradeMessageTier2Plus
  }

  // Replace {nextPlan} with actual plan name
  const finalMessage = message.replace('{nextPlan}', nextPlan.name)

  return (
    <>
      <div className="border border-border/40 rounded-lg bg-muted/20 p-3">
        <div className="flex items-start gap-3">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground/80">
                  {currentUsage} / {limit === -1 ? 'Unlimited' : limit} clients used
                  {limit !== -1 && (
                    <span className="text-muted-foreground/70 font-normal ml-1">
                      ({percentage.toFixed(0)}%)
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                  {finalMessage}
                </p>
              </div>
              <Button
                onClick={() => setShowUpgradeModal(true)}
                variant="outline"
                size="sm"
                className="h-7 text-[11px] shrink-0 border-border/50 hover:bg-accent/50"
              >
                Upgrade
              </Button>
            </div>
          </div>
        </div>
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        organizationId={organizationId}
      />
    </>
  )
}

export function TierPromotionAlertSkeleton() {
  return <Skeleton className="h-32 w-full" />
}
