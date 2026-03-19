'use client'

/**
 * Payment Details Step
 *
 * Displays billing interval selection and Stripe Elements card form.
 * Custom payment flow with Stripe webhook handling.
 *
 * FLOW:
 * 1. User submits payment -> creates Stripe subscription
 * 2. Show progress modal
 * 3. Stripe webhook creates organization
 * 4. Realtime event notifies frontend instantly (no polling!)
 * 5. Redirect to dashboard
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { useRealtime } from '@/lib/realtime-client'
import { BillingIntervalSelector } from './billing-interval-selector'
import { StripeElementsProvider } from './stripe-elements-provider'
import { PaymentCardForm } from './payment-card-form'
import { OnboardingProgressModal } from './onboarding-progress-modal'
import { toast } from 'sonner'
import { authClient } from '@/lib/better-auth/auth-client'

// ============================================================================
// TYPES
// ============================================================================

interface StudioData {
  studioName: string
  phoneNumber: string
  country: string
  address: string
  city: string
  state: string
  zipCode: string
}

interface OnboardingSurvey {
  referralSource?: string
  role?: string
  teamSize?: string
  intendedUse?: string
  niche?: string
}

interface StepPaymentDetailsProps {
  onBack: () => void
  selectedPlan: string
  studioData?: StudioData
  onTrialExpired: () => void
  forceHideTrials?: boolean
  onboardingSurvey?: OnboardingSurvey
}

type BillingInterval = 'monthly' | 'yearly'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Calculate savings percentage for yearly billing */
function calculateSavings(monthlyPrice: number, yearlyPrice: number): number {
  if (monthlyPrice === 0 || yearlyPrice === 0) return 0

  const annualMonthly = monthlyPrice * 12
  const savings = annualMonthly - yearlyPrice
  const percentage = Math.round((savings / annualMonthly) * 100)

  return percentage > 0 ? percentage : 0
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StepPaymentDetails({
  onBack,
  selectedPlan,
  studioData,
  onTrialExpired,
  forceHideTrials = false,
  onboardingSurvey,
}: StepPaymentDetailsProps) {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [progressSteps, setProgressSteps] = useState<
    Array<{
      id: string
      label: string
      status: 'pending' | 'processing' | 'complete'
    }>
  >([
    { id: 'payment', label: 'Processing payment', status: 'pending' },
    { id: 'organization', label: 'Creating your studio', status: 'pending' },
    { id: 'complete', label: 'Finalizing setup', status: 'pending' },
  ])

  // Fetch plans data (prefetched on server - instantly available)
  const { data: plansData } = trpc.features.getAvailablePlans.useQuery()

  // Check if user has used a trial before
  const { data: trialStatus } = trpc.payment.getUserTrialStatus.useQuery()

  // Get current user ID for realtime event filtering
  // Uses tRPC query (protectedProcedure ensures user is authenticated)
  const { data: userProfile } = trpc.user.getProfile.useQuery()
  const currentUserId = userProfile?.id

  // Ref to track current userId for realtime callback (avoids stale closure)
  const userIdRef = useRef<string | undefined>(currentUserId)
  useEffect(() => {
    userIdRef.current = currentUserId
  }, [currentUserId])

  // Ref to track isCompleted state for realtime callback
  const isCompletedRef = useRef(isCompleted)
  useEffect(() => {
    isCompletedRef.current = isCompleted
  }, [isCompleted])

  // tRPC mutations
  const createOrganization = trpc.organization.createOrganization.useMutation()
  const createSubscription = trpc.payment.createSubscription.useMutation()

  /**
   * Realtime subscription for onboarding completion
   *
   * WHY: Replaces polling - instant notification when organization is created
   * HOW: Stripe webhook emits 'onboarding.completed' event after org creation
   *
   * CRITICAL: Use refs for userId and isCompleted to avoid stale closure
   */
  useRealtime({
    events: ['onboarding.completed'],
    onData({ data }) {
      // Only process if this event is for the current user
      if (data.userId !== userIdRef.current) return

      // Prevent duplicate handling
      if (isCompletedRef.current) return

      // Organization created! Update all steps to complete
      setIsCompleted(true)
      setProgressSteps([
        { id: 'payment', label: 'Processing payment', status: 'complete' },
        {
          id: 'organization',
          label: 'Creating your studio',
          status: 'complete',
        },
        { id: 'complete', label: 'Finalizing setup', status: 'complete' },
      ])

      // Wait a moment to show completion, then redirect
      setTimeout(() => {
        toast.success('Welcome to your studio!')
        // Hard navigation to ensure fresh server-side load
        window.location.href = '/'
      }, 1500)
    },
  })

  const platformConfig = plansData?.platformConfig

  // Dynamically modify plans to remove trials if user has used one before
  // Use useMemo to ensure this recalculates when trialStatus changes
  const plans = useMemo(() => {
    if (!plansData?.plans) return undefined

    // If forceHideTrials is true, strip trials immediately (fraud detection)
    if (forceHideTrials) {
      return plansData.plans.map(plan => {
        if (plan.trialDays > 0) {
          return { ...plan, trialDays: 0 }
        }
        return plan
      })
    }

    // If trial status hasn't loaded yet, show original plans
    // They will update when trialStatus loads
    if (trialStatus === undefined) return plansData.plans

    return plansData.plans.map(plan => {
      if (trialStatus?.hasUsedTrialBefore && plan.trialDays > 0) {
        return { ...plan, trialDays: 0 }
      }
      return plan
    })
  }, [plansData?.plans, trialStatus, forceHideTrials])

  const currentPlan = plans?.find((p) => p.key === selectedPlan)

  // Get prices and trial info
  const monthlyPrice = currentPlan?.monthlyPrice?.amount || 0
  const yearlyPrice = currentPlan?.yearlyPrice?.amount || 0
  const savingsPercentage = calculateSavings(monthlyPrice, yearlyPrice)

  // Use the ALREADY MODIFIED trialDays from currentPlan (which comes from the plans useMemo)
  // The plans array already has trials stripped out if user has used trial before
  const trialDays = currentPlan?.trialDays ?? 0

  const requiresPayment =
    platformConfig?.acceptPaymentForFreePlan || !currentPlan?.isFree
  const hasBillingOptions = !currentPlan?.isFree // Only paid plans have billing intervals

  // Show loading while plans are being modified based on trial status
  const isLoadingPlans = !plans || trialStatus === undefined

  /**
   * Handle free plan flow (no payment required)
   */
  const handleFreePlanContinue = async () => {
    if (!studioData?.studioName) {
      toast.error(
        'Studio information is missing. Please go back and fill in your details.'
      )
      return
    }

    setIsProcessing(true)

    try {
      // Create organization (includes onboarding survey data for analytics)
      const res = await createOrganization.mutateAsync({
        studioName: studioData.studioName,
        phoneNumber: studioData.phoneNumber,
        country: studioData.country,
        address: studioData.address,
        city: studioData.city,
        state: studioData.state,
        zipCode: studioData.zipCode,
        referralSource: onboardingSurvey?.referralSource,
        role: onboardingSurvey?.role,
        teamSize: onboardingSurvey?.teamSize,
        intendedUse: onboardingSurvey?.intendedUse,
        niche: onboardingSurvey?.niche,
      })

      toast.success('Organization created successfully!')

      await authClient.organization.setActive({
        organizationId: res.organizationId,
        organizationSlug: res.slug,
      })

      // Hard navigation to ensure fresh server-side load
      window.location.href = '/'
    } catch (error) {
      console.error('Organization creation error:', error)
      toast.error('Failed to create organization. Please try again.')
      setIsProcessing(false)
    }
  }

  /**
   * Handle payment submission from card form
   * 1. Create subscription with payment method
   * 2. Show progress modal
   * 3. Realtime event fires when webhook creates organization
   * 4. Redirect when complete
   */
  const handlePaymentSubmit = async (paymentMethodId: string) => {
    if (!studioData?.studioName) {
      toast.error(
        'Studio information is missing. Please go back and fill in your details.'
      )
      throw new Error('Missing studio data')
    }

    setIsProcessing(true)

    try {
      // Show progress modal and mark payment as processing
      setShowProgressModal(true)
      setProgressSteps([
        { id: 'payment', label: 'Processing payment', status: 'processing' },
        {
          id: 'organization',
          label: 'Creating your studio',
          status: 'pending',
        },
        { id: 'complete', label: 'Finalizing setup', status: 'pending' },
      ])

      // Create subscription with studioData
      // Stripe webhook will handle organization creation server-side
      await createSubscription.mutateAsync({
        planKey: selectedPlan,
        billingInterval,
        paymentMethodId,
        expectTrial: trialDays > 0, // Tell backend if user expects a trial
        studioData: {
          studioName: studioData.studioName,
          phoneNumber: studioData.phoneNumber,
          country: studioData.country,
          address: studioData.address,
          city: studioData.city,
          state: studioData.state,
          zipCode: studioData.zipCode,
          referralSource: onboardingSurvey?.referralSource,
          role: onboardingSurvey?.role,
          teamSize: onboardingSurvey?.teamSize,
          intendedUse: onboardingSurvey?.intendedUse,
          niche: onboardingSurvey?.niche,
        },
      })

      // Payment successful! Update progress
      setProgressSteps([
        { id: 'payment', label: 'Processing payment', status: 'complete' },
        {
          id: 'organization',
          label: 'Creating your studio',
          status: 'processing',
        },
        { id: 'complete', label: 'Finalizing setup', status: 'pending' },
      ])

      // Realtime subscription will handle organization creation notification
    } catch (error) {
      console.error('Payment flow error:', error)

      // Check for TRIAL_ALREADY_USED error - user tried to use trial with previously used card
      if (error instanceof Error && error.message === 'TRIAL_ALREADY_USED') {
        setIsProcessing(false)
        setShowProgressModal(false)
        onTrialExpired() // Trigger navigation back to plan selection
        return
      }

      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to process payment. Please try again.'
      )
      setIsProcessing(false)
      setShowProgressModal(false)
      throw error
    }
  }

  return (
    <>
      {/* Progress Modal */}
      <OnboardingProgressModal
        open={showProgressModal}
        steps={progressSteps}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
              Payment Details
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {hasBillingOptions
                ? 'Choose your billing interval and enter your payment details'
                : 'Add your payment details to continue. You will only be charged for pay as you go features.'}
            </p>
          </div>

          <div className="space-y-6">
            {/* Show loading state while plans are being calculated */}
            {isLoadingPlans ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {/* Billing Interval Selector - Only for paid plans */}
                {requiresPayment && hasBillingOptions && (
                  <BillingIntervalSelector
                    value={billingInterval}
                    onChange={setBillingInterval}
                    monthlyPrice={monthlyPrice}
                    yearlyPrice={yearlyPrice}
                    savingsPercentage={savingsPercentage}
                    trialDays={trialDays}
                    currency={currentPlan?.monthlyPrice?.currency || currentPlan?.yearlyPrice?.currency}
                  />
                )}

                {/* Payment Form or Free Plan Button */}
                {requiresPayment ? (
                  <StripeElementsProvider>
                    <PaymentCardForm
                      onSubmit={handlePaymentSubmit}
                      onBack={onBack}
                      isProcessing={isProcessing}
                    />
                  </StripeElementsProvider>
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <p className="text-muted-foreground text-sm">
                        No payment required for this plan
                      </p>
                    </div>

                    {/* Navigation Buttons for Free Plan */}
                    <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onBack}
                        disabled={isProcessing}
                        className="w-full sm:w-auto"
                      >
                        Back
                      </Button>

                      <Button
                        type="button"
                        onClick={handleFreePlanContinue}
                        disabled={isProcessing}
                        className="w-full sm:w-auto"
                      >
                        {isProcessing ? 'Processing...' : 'Continue'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
