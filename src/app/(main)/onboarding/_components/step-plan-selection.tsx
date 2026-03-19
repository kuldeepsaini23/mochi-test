'use client'

/**
 * STEP PLAN SELECTION COMPONENT
 *
 * This component handles ONLY the plan selection step of onboarding.
 * It shows plans with MONTHLY pricing only.
 * Billing interval selection happens on the next step (payment details).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlanSelector } from './plan-selector'
import { trpc } from '@/trpc/react-provider'

interface StepPlanSelectionProps {
  onBack: () => void
  onNext: (selectedPlan: string) => void
  initialPlan?: string
  forceHideTrials?: boolean
}

export function StepPlanSelection({
  onBack,
  onNext,
  initialPlan,
  forceHideTrials = false,
}: StepPlanSelectionProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>(initialPlan || '')

  // Check if user has used a trial before
  const { data: trialStatus } = trpc.payment.getUserTrialStatus.useQuery()

  // Determine if we should hide trials (from force override OR user has used trial before)
  const shouldHideTrials = forceHideTrials || trialStatus?.hasUsedTrialBefore

  const handleContinue = () => {
    if (selectedPlan) {
      onNext(selectedPlan)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Choose Your Plan
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Select a plan that works for you
          </p>
        </div>

        <div className="space-y-6">
          {/* Plan Selection - Always show monthly pricing */}
          <PlanSelector
            billingInterval="monthly"
            value={selectedPlan}
            onChange={setSelectedPlan}
            disabled={false}
            hideTrialBadges={shouldHideTrials}
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="w-full sm:w-auto"
        >
          Back
        </Button>

        <Button
          type="button"
          onClick={handleContinue}
          className="w-full sm:w-auto"
          disabled={!selectedPlan}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
