"use client";

/**
 * ============================================================================
 * ONBOARDING CONTAINER
 * ============================================================================
 *
 * Orchestrates the 7-step onboarding flow. Each question gets its own screen:
 *   1. Referral Source — "How did you hear about us?"
 *   2. Your Role — CEO, employee, student, etc.
 *   3. Team Size — Solo, 2-5, 6-10, etc.
 *   4. Intended Use — Client management, marketing, payments, etc.
 *   5. Niche — Open-ended "Tell us about your business"
 *   6. Studio Info — Business name, contact, address
 *   7. Plan Selection — Choose subscription tier
 *   8. Payment Details — Billing interval + Stripe card form
 *
 * All survey data (referralSource + role + teamSize + intendedUse) is
 * passed to the payment step and persisted in Organization.metadata.
 *
 * SOURCE OF TRUTH: OnboardingData
 */

import { PlatformLogo } from "@/components/global/platform-logo";
import { useState } from "react";
import { StepReferralSource } from "./step-referral-source";
import { StepAboutYou, type AboutYouData } from "./step-about-you";
import { StepNiche } from "./step-niche";
import { StepStudioInfo, type StudioInfoData } from "./step-studio-info";
import { StepPlanSelection } from "./step-plan-selection";
import { StepPaymentDetails } from "./step-payment-details";
import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Accumulated onboarding data across all steps.
 * Built up progressively as user moves through the flow.
 */
interface OnboardingData {
  /** Step 1: How the user discovered the platform */
  referralSource: string;
  /** Steps 2-4: Role, team size, intended platform use */
  aboutYou: AboutYouData;
  /** Step 5: Open-ended niche / business description */
  niche: string;
  /** Step 6: Business contact and address info */
  studioInfo: StudioInfoData;
  /** Step 7: Selected subscription plan key */
  selectedPlan: string;
}

/** Total number of onboarding steps */
const TOTAL_STEPS = 8;

// ============================================================================
// COMPONENT
// ============================================================================

export function OnboardingContainer() {
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState<Partial<OnboardingData>>({});
  const [trialErrorShown, setTrialErrorShown] = useState(false);

  // --------------------------------------------------------------------------
  // STEP 1: Referral Source
  // --------------------------------------------------------------------------

  const updateReferralData = (data: { referralSource: string }) => {
    setOnboardingData((prev) => ({ ...prev, referralSource: data.referralSource }));
  };

  const handleReferralNext = () => {
    setCurrentStep(2);
  };

  // --------------------------------------------------------------------------
  // STEPS 2-4: About You (role, team size, intended use — one per screen)
  // --------------------------------------------------------------------------

  /** Update a single about-you field and advance to next step */
  const handleAboutYouChange = (field: keyof AboutYouData, value: string) => {
    setOnboardingData((prev) => ({
      ...prev,
      aboutYou: { ...prev.aboutYou, [field]: value } as AboutYouData,
    }));
  };

  // --------------------------------------------------------------------------
  // STEP 5: Niche
  // --------------------------------------------------------------------------

  const handleNicheChange = (value: string) => {
    setOnboardingData((prev) => ({ ...prev, niche: value }));
  };

  // --------------------------------------------------------------------------
  // STEP 6: Studio Info
  // --------------------------------------------------------------------------

  const updateStudioData = (data: StudioInfoData) => {
    setOnboardingData((prev) => ({ ...prev, studioInfo: data }));
  };

  const handleStudioNext = () => {
    setCurrentStep(7);
  };

  // --------------------------------------------------------------------------
  // STEP 7: Plan Selection
  // --------------------------------------------------------------------------

  const handlePlanNext = (selectedPlan: string) => {
    setOnboardingData((prev) => ({ ...prev, selectedPlan }));
    setCurrentStep(8);
  };

  // --------------------------------------------------------------------------
  // SHARED NAVIGATION
  // --------------------------------------------------------------------------

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleTrialExpired = () => {
    /** User tried to use trial with previously used card — go back to plan selection */
    setCurrentStep(7);
    setTrialErrorShown(true);
    toast.error("Your free trial has ended. Please select a plan to get started!");
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="w-full max-w-md mx-auto pt-8 md:pt-16 space-y-8">
        {/* Logo at top center */}
        <div className="flex justify-center">
          <PlatformLogo href="/" />
        </div>

        {/* Step indicator text */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Step {currentStep} of {TOTAL_STEPS}
          </p>
        </div>

        {/* Step Content */}
        <div>
          {/* Step 1: How did you hear about us? */}
          {currentStep === 1 && (
            <StepReferralSource
              value={onboardingData.referralSource || ''}
              onChange={updateReferralData}
              onNext={handleReferralNext}
            />
          )}

          {/* Step 2: What best describes your role? */}
          {currentStep === 2 && (
            <StepAboutYou
              question="role"
              value={onboardingData.aboutYou?.role || ''}
              onChange={(val) => handleAboutYouChange('role', val)}
              onNext={() => setCurrentStep(3)}
              onBack={handleBack}
            />
          )}

          {/* Step 3: How large is your team? */}
          {currentStep === 3 && (
            <StepAboutYou
              question="teamSize"
              value={onboardingData.aboutYou?.teamSize || ''}
              onChange={(val) => handleAboutYouChange('teamSize', val)}
              onNext={() => setCurrentStep(4)}
              onBack={handleBack}
            />
          )}

          {/* Step 4: How do you plan to use the platform? */}
          {currentStep === 4 && (
            <StepAboutYou
              question="intendedUse"
              value={onboardingData.aboutYou?.intendedUse || ''}
              onChange={(val) => handleAboutYouChange('intendedUse', val)}
              onNext={() => setCurrentStep(5)}
              onBack={handleBack}
            />
          )}

          {/* Step 5: Tell us about your business (niche) */}
          {currentStep === 5 && (
            <StepNiche
              value={onboardingData.niche || ''}
              onChange={handleNicheChange}
              onNext={() => setCurrentStep(6)}
              onBack={handleBack}
            />
          )}

          {/* Step 6: Studio information */}
          {currentStep === 6 && (
            <StepStudioInfo
              value={onboardingData.studioInfo}
              onChange={updateStudioData}
              onNext={handleStudioNext}
              onBack={handleBack}
            />
          )}

          {/* Step 7: Plan selection */}
          {currentStep === 7 && (
            <StepPlanSelection
              onBack={handleBack}
              onNext={handlePlanNext}
              initialPlan={onboardingData.selectedPlan}
              forceHideTrials={trialErrorShown}
            />
          )}

          {/* Step 8: Payment details — receives survey data for DB persistence */}
          {currentStep === 8 && (
            <StepPaymentDetails
              onBack={handleBack}
              selectedPlan={onboardingData.selectedPlan || ''}
              studioData={onboardingData.studioInfo}
              onTrialExpired={handleTrialExpired}
              forceHideTrials={trialErrorShown}
              onboardingSurvey={{
                referralSource: onboardingData.referralSource,
                role: onboardingData.aboutYou?.role,
                teamSize: onboardingData.aboutYou?.teamSize,
                intendedUse: onboardingData.aboutYou?.intendedUse,
                niche: onboardingData.niche,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
