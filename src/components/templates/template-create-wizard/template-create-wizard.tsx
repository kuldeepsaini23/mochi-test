/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — STEP CONTAINER
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateCreateWizard, CreateTemplateWizard
 *
 * WHY: 4-step wizard for creating a new template from an existing feature.
 * Guides the user through: select feature, review dependencies, add metadata,
 * and confirm/publish.
 *
 * HOW: Reads createWizardStep from context and renders the matching step.
 * Includes a progress indicator (dots), step title, and back/next navigation.
 */

'use client'

import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useTemplateLibrary } from '../template-library-context'
import { StepSelectFeature } from './step-select-feature'
import { StepDependencyReview } from './step-dependency-review'
import { StepMetadata } from './step-metadata'
import { StepConfirm } from './step-confirm'

// ============================================================================
// WIZARD STEPS CONFIGURATION
// ============================================================================

/** Step definitions with titles for the progress indicator */
const WIZARD_STEPS = [
  { title: 'Select Feature', description: 'Choose what to template' },
  { title: 'Dependencies', description: 'Review linked items' },
  { title: 'Details', description: 'Name and describe your template' },
  { title: 'Confirm', description: 'Review and publish' },
] as const

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Wizard container that manages step rendering and navigation.
 * Each step is a separate component that reads/writes context state.
 *
 * Step flow:
 * 0 → Select feature (with origin check)
 * 1 → Review dependencies
 * 2 → Add metadata (name, description, tags, thumbnail)
 * 3 → Confirm and publish
 */
export function TemplateCreateWizard() {
  const { createWizardStep, setCreateStep, goBack } = useTemplateLibrary()
  const currentStep = WIZARD_STEPS[createWizardStep]

  return (
    <div className="flex h-full flex-col">
      {/* Header — Back button + Step title */}
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (createWizardStep === 0) {
              goBack()
            } else {
              setCreateStep(createWizardStep - 1)
            }
          }}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          {createWizardStep === 0 ? 'Back to Library' : 'Previous'}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {/* Progress Dots — visual indicator of which step we're on */}
          {WIZARD_STEPS.map((step, index) => (
            <div
              key={step.title}
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                index === createWizardStep
                  ? 'bg-primary'
                  : index < createWizardStep
                    ? 'bg-primary/40'
                    : 'bg-muted-foreground/20'
              )}
            />
          ))}
        </div>
      </header>

      {/* Step Title */}
      <div className="shrink-0 px-6 pt-6 pb-2">
        <h2 className="text-lg font-semibold">{currentStep?.title}</h2>
        <p className="text-sm text-muted-foreground">{currentStep?.description}</p>
      </div>

      {/* Step Content — scrollable area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {createWizardStep === 0 && <StepSelectFeature />}
        {createWizardStep === 1 && <StepDependencyReview />}
        {createWizardStep === 2 && <StepMetadata />}
        {createWizardStep === 3 && <StepConfirm />}
      </div>
    </div>
  )
}
