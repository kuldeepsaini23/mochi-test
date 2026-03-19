/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — STEP 2: DEPENDENCY REVIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: StepDependencyReview, DependencyReviewStep
 *
 * WHY: After selecting a feature, the user reviews its detected dependencies.
 * Websites can reference forms, CMS tables, products; automations can reference
 * emails, forms, pipelines. The user decides what to bundle.
 *
 * HOW: Fetches the dependency tree via tRPC, displays it as an indented list
 * with feature type icons, and offers three prominent choices:
 * "Bundle All" / "Skip All" / "Choose Which to Include"
 *
 * If "Choose" is selected, shows checkboxes for each dependency.
 * If no dependencies are detected, auto-advances to the next step.
 */

'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  PackageCheck,
  PackageX,
  ListChecks,
  CheckCircle2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type {
  DependencyChoice,
  DetectedDependency,
} from '@/lib/templates/types'
import { useTemplateLibrary } from '../template-library-context'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step 2 — Review and select dependencies for bundling.
 *
 * Reads the selected feature type and ID from a previous step (stored in
 * the wizard's local state, passed through context). Fetches the dependency
 * tree and presents the user with three options.
 */
export function StepDependencyReview() {
  const {
    wizardSelectedFeature,
    setCreateStep,
    setWizardDependencySelection,
    wizardIncludeCmsRows,
    setWizardIncludeCmsRows,
    organizationId,
  } = useTemplateLibrary()

  /** User's dependency choice */
  const [choice, setChoice] = useState<DependencyChoice | null>(null)
  /** Selected dependency IDs when choice === 'choose' */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /**
   * Fetch the dependency tree for the selected feature.
   * Uses the wizard state set by Step 1 (or preselectedFeature fallback).
   */
  const featureType = wizardSelectedFeature?.featureType
  const featureId = wizardSelectedFeature?.featureId

  const { data: dependencyTree, isLoading } = trpc.templates.detectDependencies.useQuery(
    {
      organizationId,
      featureType: featureType!,
      featureId: featureId!,
    },
    { enabled: !!featureType && !!featureId && !!organizationId }
  )

  const dependencies = dependencyTree?.dependencies ?? []
  const hasDependencies = dependencies.length > 0

  /**
   * Check if any dependency (or nested child) is a CMS_SCHEMA type.
   * When true, we show the "Include CMS table data" toggle so the user
   * can opt-in to bundling existing rows alongside the schema structure.
   */
  const hasCmsDependencies = dependencies.some(
    (dep) =>
      dep.featureType === 'CMS_SCHEMA' ||
      dep.children.some((c) => c.featureType === 'CMS_SCHEMA')
  )

  /**
   * Auto-advance when no dependencies are detected.
   * This avoids showing an empty step.
   */
  useEffect(() => {
    if (!isLoading && dependencyTree && !hasDependencies) {
      /** No dependencies — save skip_all and auto-advance */
      setWizardDependencySelection({ choice: 'skip_all', selectedIds: [] })
      /** Small delay so user sees the "no dependencies" message */
      const timer = setTimeout(() => setCreateStep(2), 1500)
      return () => clearTimeout(timer)
    }
  }, [isLoading, dependencyTree, hasDependencies, setCreateStep, setWizardDependencySelection])

  /** Toggle a dependency in the selected set */
  const toggleDependency = (depId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(depId)) {
        next.delete(depId)
      } else {
        next.add(depId)
      }
      return next
    })
  }

  /**
   * When user selects "Bundle All", select all dependency IDs.
   * When "Skip All", clear the selection.
   * When "Choose", show the checkbox list.
   */
  const handleChoiceSelect = (newChoice: DependencyChoice) => {
    setChoice(newChoice)
    if (newChoice === 'bundle_all') {
      setSelectedIds(new Set(flattenDependencyIds(dependencies)))
    } else if (newChoice === 'skip_all') {
      setSelectedIds(new Set())
    }
  }

  /** Proceed to step 3 (metadata) — save dependency selection to wizard context */
  const handleNext = () => {
    if (choice) {
      setWizardDependencySelection({
        choice,
        selectedIds: choice === 'bundle_all'
          ? flattenDependencyIds(dependencies)
          : choice === 'choose'
            ? Array.from(selectedIds)
            : [],
      })
    } else {
      /** No dependencies — skip_all by default */
      setWizardDependencySelection({ choice: 'skip_all', selectedIds: [] })
    }
    setCreateStep(2)
  }

  /** Loading State */
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Scanning for dependencies...</p>
      </div>
    )
  }

  /** No Dependencies */
  if (!hasDependencies) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-sm font-medium">No dependencies detected</p>
        <p className="text-xs text-muted-foreground">
          This feature is self-contained and can be templated independently.
          Advancing to the next step...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Dependency Count Summary */}
      <p className="text-sm text-muted-foreground">
        Found {dependencyTree?.totalCount ?? 0} linked item
        {(dependencyTree?.totalCount ?? 0) !== 1 ? 's' : ''} that this feature references.
        Choose how to handle them.
      </p>

      {/* Three Choice Buttons — prominent, side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ChoiceCard
          selected={choice === 'bundle_all'}
          onClick={() => handleChoiceSelect('bundle_all')}
          icon={PackageCheck}
          title="Bundle All"
          description="Include all dependencies"
        />
        <ChoiceCard
          selected={choice === 'skip_all'}
          onClick={() => handleChoiceSelect('skip_all')}
          icon={PackageX}
          title="Skip All"
          description="Only the main feature"
        />
        <ChoiceCard
          selected={choice === 'choose'}
          onClick={() => handleChoiceSelect('choose')}
          icon={ListChecks}
          title="Choose"
          description="Pick specific items"
        />
      </div>

      {/* Dependency Tree — always shown for context */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Detected Dependencies:</p>
        <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-1">
          {dependencies.map((dep) => (
            <DependencyRow
              key={dep.featureId}
              dependency={dep}
              depth={0}
              showCheckbox={choice === 'choose'}
              selectedIds={selectedIds}
              onToggle={toggleDependency}
            />
          ))}
        </div>
      </div>

      {/* CMS Row Data Toggle — only shown when CMS dependencies exist and user isn't skipping all */}
      {hasCmsDependencies && choice !== 'skip_all' && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="cms-rows-toggle" className="text-sm font-medium">
              Include CMS table data
            </Label>
            <p className="text-xs text-muted-foreground">
              Bundled CMS tables will include their existing rows alongside the schema
            </p>
          </div>
          <Switch
            id="cms-rows-toggle"
            checked={wizardIncludeCmsRows}
            onCheckedChange={setWizardIncludeCmsRows}
          />
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleNext} disabled={choice === null}>
          Next: Template Details
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// CHOICE CARD — Styled button for the three dependency options
// ============================================================================

/**
 * ChoiceCard — Pipeline ticket card design for dependency options.
 * Uses the same ring-1/ring-border/rounded-xl pattern as sortable-item.tsx.
 * Selected state swaps ring-border for ring-primary.
 */
function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 text-center',
        'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl',
        'dark:border-t dark:ring-background dark:shadow-sm',
        'ring-1 transition-shadow duration-200',
        selected
          ? 'ring-primary dark:ring-primary'
          : 'ring-border dark:ring-1 hover:ring-primary/50'
      )}
    >
      <Icon className={cn('h-6 w-6', selected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  )
}

// ============================================================================
// DEPENDENCY ROW — Recursive row for the dependency tree
// ============================================================================

function DependencyRow({
  dependency,
  depth,
  showCheckbox,
  selectedIds,
  onToggle,
}: {
  dependency: DetectedDependency
  depth: number
  showCheckbox: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
}) {
  const meta = TEMPLATE_CATEGORY_META[dependency.featureType]
  const Icon = meta.icon

  /**
   * Display name — use the human-readable category label as fallback
   * when the scanner couldn't resolve the feature name (returns the raw
   * enum like CMS_SCHEMA). Users should never see raw enum values.
   */
  const displayName =
    dependency.featureName === dependency.featureType
      ? meta.label
      : dependency.featureName

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {showCheckbox && (
          <Checkbox
            checked={selectedIds.has(dependency.featureId)}
            onCheckedChange={() => onToggle(dependency.featureId)}
          />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm">{displayName}</p>
          <p className="text-xs text-muted-foreground">{dependency.reason}</p>
        </div>
      </div>

      {/* Render nested children recursively */}
      {dependency.children.map((child) => (
        <DependencyRow
          key={child.featureId}
          dependency={child}
          depth={depth + 1}
          showCheckbox={showCheckbox}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/** Flatten all dependency IDs from the tree for "Bundle All" selection */
function flattenDependencyIds(deps: DetectedDependency[]): string[] {
  const ids: string[] = []
  for (const dep of deps) {
    ids.push(dep.featureId)
    ids.push(...flattenDependencyIds(dep.children))
  }
  return ids
}
