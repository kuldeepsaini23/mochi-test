'use client'

/**
 * ============================================================================
 * NICHE — OPEN-ENDED ONBOARDING STEP
 * ============================================================================
 *
 * Asks the user to describe their niche / what they do in a free-text field.
 * This helps us understand who our users are and what market they serve.
 *
 * SOURCE OF TRUTH: StepNicheProps
 */

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// ============================================================================
// TYPES
// ============================================================================

interface StepNicheProps {
  value: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepNiche({ value, onChange, onNext, onBack }: StepNicheProps) {
  const isFormValid = value.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isFormValid) onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Tell us about your business
          </h2>
          <p className="text-sm text-muted-foreground">
            Describe what you do and who you serve — this helps us personalize your experience
          </p>
        </div>

        {/* Free-text input */}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. I'm a high-ticket fitness coach helping men over 30 get in shape, or I run a digital marketing agency for local businesses..."
          rows={4}
          className="rounded-lg bg-linear-to-br from-muted/50 to-muted border-t-2 border-t-accent dark:border-b dark:border-b-border/50 text-sm min-h-[120px]"
        />
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
