'use client'

/**
 * ============================================================================
 * ABOUT YOU — SINGLE-QUESTION ONBOARDING STEP
 * ============================================================================
 *
 * Renders ONE question per screen (role, team size, or intended use).
 * The container renders this component 3 times across 3 separate steps,
 * passing a different `question` prop each time.
 *
 * Follows the exact same visual pattern as StepReferralSource:
 * radio-card buttons with checkmark circles + back/continue navigation.
 *
 * SOURCE OF TRUTH: AboutYouData, AboutYouQuestion
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

/** All three "about you" fields collected across 3 screens */
export interface AboutYouData {
  role: string
  teamSize: string
  intendedUse: string
}

/** Which question this instance of the component should render */
export type AboutYouQuestion = 'role' | 'teamSize' | 'intendedUse'

interface StepAboutYouProps {
  /** Which question to show on this screen */
  question: AboutYouQuestion
  /** Current selected value for this question */
  value: string
  /** Called when user selects an option */
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

// ============================================================================
// QUESTION CONFIGS — heading, description, and options for each question
// ============================================================================

interface QuestionOption {
  value: string
  label: string
  description: string
}

interface QuestionConfig {
  heading: string
  description: string
  options: QuestionOption[]
}

const QUESTION_CONFIGS: Record<AboutYouQuestion, QuestionConfig> = {
  role: {
    heading: 'What best describes your role?',
    description: 'This helps us tailor the experience to your needs',
    options: [
      { value: 'business_owner', label: 'Business Owner', description: 'CEO, founder, or co-founder' },
      { value: 'team_member', label: 'Team Member', description: 'Employee or manager' },
      { value: 'freelancer', label: 'Freelancer', description: 'Independent professional or consultant' },
      { value: 'student', label: 'Student', description: 'Currently learning' },
    ],
  },
  teamSize: {
    heading: 'How large is your team?',
    description: 'Let us know the size of your organization',
    options: [
      { value: 'solo', label: 'Just me', description: 'Solo operation' },
      { value: '2_10', label: '2-10 people', description: 'Small team' },
      { value: '11_50', label: '11-50 people', description: 'Growing team' },
      { value: '50_plus', label: '50+ people', description: 'Large organization' },
    ],
  },
  intendedUse: {
    heading: 'How do you plan to use the platform?',
    description: 'We\'ll customize your setup based on your goals',
    options: [
      { value: 'client_management', label: 'Client Management', description: 'Organize and track clients' },
      { value: 'marketing', label: 'Marketing & Automation', description: 'Email campaigns and workflows' },
      { value: 'payments', label: 'Online Payments', description: 'Accept and manage payments' },
      { value: 'all', label: 'Everything', description: 'Full platform usage' },
    ],
  },
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepAboutYou({
  question,
  value,
  onChange,
  onNext,
  onBack,
}: StepAboutYouProps) {
  const config = QUESTION_CONFIGS[question]
  const isFormValid = value.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isFormValid) onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {/* Question heading + description */}
        <div className="space-y-2">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            {config.heading}
          </h2>
          <p className="text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>

        {/* Radio-card options — exact same style as StepReferralSource */}
        <div className="space-y-2">
          {config.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-all bg-linear-to-br from-muted/50 to-muted border-t-2 border-t-accent dark:border-b dark:border-b-border/50',
                'hover:bg-accent/50 hover:cursor-pointer',
                value === option.value ? ' bg-accent' : 'border-border'
              )}
            >
              {/* Checkmark circle */}
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border mt-0.5 ',
                  value === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30'
                )}
              >
                {value === option.value && <Check className="h-3 w-3" />}
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Back + Continue buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          Back
        </Button>
        <Button type="submit" disabled={!isFormValid} className="w-full sm:w-auto">
          Continue
        </Button>
      </div>
    </form>
  )
}
