/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — STEP 1: SELECT FEATURE
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: StepSelectFeature, FeatureSelector
 *
 * WHY: First step of the create wizard. The user picks a feature type
 * (website, email, automation, etc.) and then selects a specific feature
 * from their organization. If the feature was installed from another template
 * (has an origin marker), it shows the blocked alert and disables proceeding.
 *
 * HOW: Two-phase selection:
 * Phase 1: Grid of feature type cards (if no preselectedFeature)
 * Phase 2: Searchable list of the org's features for that type
 * After selection: origin check query → blocked alert or enable next
 */

'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2, Check, AlertCircle } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_META,
} from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { useTemplateLibrary } from '../template-library-context'
import { TemplateOriginBlocked } from '../template-origin-blocked'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// FEATURE ITEM — Represents a selectable feature from the org
// ============================================================================

interface FeatureItem {
  id: string
  name: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step 1 of the create wizard — feature selection.
 *
 * If preselectedFeature is set (from "Save as Template" entry point),
 * skips the type selection and shows features for that type directly.
 *
 * If no preselection, shows a grid of feature type cards first,
 * then a searchable list of features after type selection.
 */
export function StepSelectFeature() {
  const {
    preselectedFeature,
    organizationId,
    setCreateStep,
    setWizardSelectedFeature,
  } = useTemplateLibrary()

  /** Selected feature type (phase 1 result) */
  const [selectedType, setSelectedType] = useState<TemplateCategory | null>(
    preselectedFeature?.featureType ?? null
  )

  /** Selected feature ID (phase 2 result) */
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    preselectedFeature?.featureId ?? null
  )

  /** Search query for filtering features in the list */
  const [featureSearch, setFeatureSearch] = useState('')

  /**
   * Fetch the list of features for the selected type.
   * This uses a dynamic tRPC query that fetches from the appropriate router
   * based on the feature type (websites, emails, automations, etc.)
   */
  /**
   * Fetch the org's features for the selected type.
   * Uses the listOrgFeatures procedure which queries the correct table
   * based on featureType and returns {id, name} pairs.
   */
  const { data: features, isLoading: featuresLoading } = trpc.templates.listOrgFeatures.useQuery(
    {
      organizationId,
      featureType: selectedType!,
      search: featureSearch || undefined,
    },
    { enabled: !!selectedType && !!organizationId }
  )

  /**
   * Origin check — runs when a feature is selected.
   * Returns whether the feature was installed from a template (isFromTemplate).
   * If true, user is blocked from re-publishing it.
   */
  const { data: originCheck, isLoading: originLoading } = trpc.templates.checkOrigin.useQuery(
    {
      organizationId,
      featureType: selectedType!,
      featureId: selectedFeatureId!,
    },
    { enabled: !!selectedType && !!selectedFeatureId && !!organizationId }
  )

  /** Whether the user can proceed to step 2 */
  const canProceed =
    selectedType !== null &&
    selectedFeatureId !== null &&
    !originLoading &&
    originCheck !== undefined &&
    !originCheck.isFromTemplate

  /** Handle proceeding to the next step — save selection to wizard context */
  const handleNext = () => {
    if (canProceed && selectedType && selectedFeatureId) {
      setWizardSelectedFeature({ featureType: selectedType, featureId: selectedFeatureId })
      setCreateStep(1)
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Phase 1: Feature Type Selection (skip if preselected) */}
      {!preselectedFeature && !selectedType && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            What type of feature would you like to create a template from?
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {TEMPLATE_CATEGORIES.map((category) => {
              const meta = TEMPLATE_CATEGORY_META[category]
              const Icon = meta.icon
              /**
               * Blueprint gets a special highlighted style to distinguish it
               * from individual feature types — it spans full width on mobile.
               */
              const isBlueprint = category === 'BLUEPRINT'
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    if (isBlueprint) {
                      /**
                       * Blueprint mode — skip the individual feature picker.
                       * Set a synthetic feature selection to trigger auto-advance
                       * to Step 1 where the blueprint feature selector will render.
                       */
                      setWizardSelectedFeature({
                        featureType: 'BLUEPRINT',
                        featureId: 'blueprint',
                      })
                    } else {
                      setSelectedType(category)
                    }
                  }}
                  className={cn(
                    'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl p-4',
                    'dark:border-t dark:ring-background dark:ring-1 dark:shadow-sm ring-1 ring-border',
                    'cursor-pointer transition-shadow duration-200 hover:ring-primary/50',
                    'flex flex-col items-center gap-2 text-center',
                    isBlueprint && 'col-span-2 lg:col-span-3 ring-primary/30 hover:ring-primary'
                  )}
                >
                  <Icon className={cn('h-8 w-8', isBlueprint ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {meta.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Phase 2: Feature List (shown after type is selected) */}
      {selectedType && (
        <div className="space-y-4">
          {/* Type indicator + change button (only if not preselected) */}
          {!preselectedFeature && (
            <div className="flex items-center gap-2">
              {(() => {
                const meta = TEMPLATE_CATEGORY_META[selectedType]
                const TypeIcon = meta.icon
                return (
                  <>
                    <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </>
                )
              })()}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedType(null)
                  setSelectedFeatureId(null)
                  setFeatureSearch('')
                }}
                className="ml-auto text-xs"
              >
                Change Type
              </Button>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search your ${TEMPLATE_CATEGORY_META[selectedType].label.toLowerCase()}s...`}
              value={featureSearch}
              onChange={(e) => setFeatureSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Feature List — simple list inside a bordered container */}
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
            {featuresLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !features || features.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <AlertCircle className="mx-auto mb-2 h-5 w-5" />
                No {TEMPLATE_CATEGORY_META[selectedType].label.toLowerCase()}s found
              </div>
            ) : (
              features.map((feature: FeatureItem) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setSelectedFeatureId(feature.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-muted/50',
                    selectedFeatureId === feature.id && 'bg-primary/10 ring-1 ring-primary/20'
                  )}
                >
                  <span className="flex-1 truncate">{feature.name}</span>
                  {selectedFeatureId === feature.id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Origin Check Result */}
          {selectedFeatureId && originLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking template origin...
            </div>
          )}

          {selectedFeatureId && originCheck?.isFromTemplate && (
            <TemplateOriginBlocked
              templateName={originCheck.templateName ?? 'Unknown Template'}
            />
          )}

          {/* Next Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleNext} disabled={!canProceed}>
              Next: Review Dependencies
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
