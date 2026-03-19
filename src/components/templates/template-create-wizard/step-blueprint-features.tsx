'use client'

/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — BLUEPRINT FEATURE SELECTOR
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: StepBlueprintFeatures, BlueprintSelector
 *
 * WHY: When creating a Blueprint template, users need to select which features
 * from their organization to include. This replaces Step 1 (Dependency Review)
 * for blueprint mode — showing ALL org features grouped by type with checkboxes.
 *
 * HOW: Fetches all features via `listAllOrgFeatures` tRPC query, groups them
 * by category with collapsible sections. Users can select individual features
 * or use "Select All" to include everything. On confirm, stores selections in
 * `wizardBlueprintFeatures` and sets `wizardDependencySelection` to trigger
 * the auto-advance to Step 2 (Metadata).
 *
 * ANTI-PLAGIARISM: Features installed from other templates have `isFromTemplate: true`
 * (via TemplateOriginMarker lookup in the tRPC query). These are shown but disabled —
 * same protection as single-feature mode's `checkOrigin` call, just applied in bulk.
 */

import { useState, useMemo } from 'react'
import { Loader2, Check, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_META,
} from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { useTemplateLibrary } from '../template-library-context'
import type { BlueprintFeatureItem } from '../template-library-context'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// FEATURE TYPE GROUPS TO SHOW (excludes BLUEPRINT itself)
// ============================================================================

const BUNDLEABLE_CATEGORIES = TEMPLATE_CATEGORIES.filter(
  (c) => c !== 'BLUEPRINT'
)

/**
 * Shape of each feature item returned by `listAllOrgFeatures`.
 * Includes the origin flag for anti-plagiarism filtering.
 *
 * SOURCE OF TRUTH: Matches the tRPC `listAllOrgFeatures` response shape.
 */
interface FeatureItemWithOrigin {
  id: string
  name: string
  /** True if this feature was installed from another template — cannot be re-bundled */
  isFromTemplate: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Blueprint feature selector — shows all org features grouped by type.
 * Users toggle individual features on/off, then confirm to proceed.
 * Features installed from templates are shown but disabled (anti-plagiarism).
 */
export function StepBlueprintFeatures() {
  const {
    organizationId,
    setWizardBlueprintFeatures,
    setWizardDependencySelection,
    setWizardIncludeCmsRows,
    wizardBlueprintFeatures,
  } = useTemplateLibrary()

  /** Fetch all features across all types in parallel (includes origin check data) */
  const { data: allFeatures, isLoading } = trpc.templates.listAllOrgFeatures.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  /** Track selected features as a Set of "featureType:featureId" keys for fast lookup */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    /** Restore from context if user navigated back */
    const initial = new Set<string>()
    for (const f of wizardBlueprintFeatures) {
      initial.add(`${f.featureType}:${f.featureId}`)
    }
    return initial
  })

  /** Track which category groups are expanded (all expanded by default) */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(BUNDLEABLE_CATEGORIES)
  )

  /**
   * Count total selectable features (excludes template-installed ones).
   * Template-installed features are visible but not selectable, so they
   * shouldn't inflate the "X of Y" counter.
   */
  const { totalSelectable, totalFromTemplate } = useMemo(() => {
    if (!allFeatures) return { totalSelectable: 0, totalFromTemplate: 0 }
    let selectable = 0
    let fromTemplate = 0
    for (const cat of BUNDLEABLE_CATEGORIES) {
      const items = (allFeatures[cat as keyof typeof allFeatures] ?? []) as FeatureItemWithOrigin[]
      for (const item of items) {
        if (item.isFromTemplate) {
          fromTemplate++
        } else {
          selectable++
        }
      }
    }
    return { totalSelectable: selectable, totalFromTemplate: fromTemplate }
  }, [allFeatures])

  /** Toggle a single feature (only if it's not from a template) */
  const toggleFeature = (featureType: TemplateCategory, featureId: string) => {
    const key = `${featureType}:${featureId}`
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  /** Select all NON-template features across all types */
  const selectAll = () => {
    if (!allFeatures) return
    const all = new Set<string>()
    for (const cat of BUNDLEABLE_CATEGORIES) {
      const items = (allFeatures[cat as keyof typeof allFeatures] ?? []) as FeatureItemWithOrigin[]
      for (const item of items) {
        if (!item.isFromTemplate) {
          all.add(`${cat}:${item.id}`)
        }
      }
    }
    setSelectedKeys(all)
  }

  /** Deselect all */
  const deselectAll = () => setSelectedKeys(new Set())

  /** Toggle a category group expansion */
  const toggleGroup = (category: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  /** Toggle all selectable features within a single category group */
  const toggleCategoryAll = (category: TemplateCategory) => {
    if (!allFeatures) return
    const items = (allFeatures[category as keyof typeof allFeatures] ?? []) as FeatureItemWithOrigin[]
    /** Only consider selectable (non-template) items for the "all selected" check */
    const selectableItems = items.filter((i) => !i.isFromTemplate)
    const allSelected = selectableItems.every((i) => selectedKeys.has(`${category}:${i.id}`))

    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const item of selectableItems) {
        const key = `${category}:${item.id}`
        if (allSelected) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      return next
    })
  }

  /**
   * Confirm selection — build BlueprintFeatureItem array, store in context,
   * and set wizardDependencySelection to trigger auto-advance to Step 2.
   */
  const handleConfirm = () => {
    if (!allFeatures || selectedKeys.size === 0) return

    /** Build the feature list from selected keys */
    const features: BlueprintFeatureItem[] = []
    for (const cat of BUNDLEABLE_CATEGORIES) {
      const items = (allFeatures[cat as keyof typeof allFeatures] ?? []) as FeatureItemWithOrigin[]
      for (const item of items) {
        if (selectedKeys.has(`${cat}:${item.id}`)) {
          features.push({
            featureType: cat,
            featureId: item.id,
            featureName: item.name,
          })
        }
      }
    }

    /** Store selections in context */
    setWizardBlueprintFeatures(features)

    /** Include CMS row data by default for blueprints (full account snapshot) */
    setWizardIncludeCmsRows(true)

    /**
     * Set dependency selection to trigger auto-advance to Step 2 (Metadata).
     * Using 'skip_all' since blueprint bundles each feature independently —
     * dependencies within each feature are handled by the bundling service.
     */
    setWizardDependencySelection({ choice: 'skip_all', selectedIds: [] })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Select Features
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose which features from your account to include in this blueprint.
          All selected features will be bundled into a single installable template.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : totalSelectable === 0 && totalFromTemplate === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No features found in your organization to bundle.
        </div>
      ) : (
        <>
          {/* Anti-plagiarism notice — shown when some features are from templates */}
          {totalFromTemplate > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-2.5">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-600/90">
                {totalFromTemplate} feature{totalFromTemplate !== 1 ? 's' : ''} installed
                from other templates cannot be re-bundled. They are shown but disabled.
              </p>
            </div>
          )}

          {/* Select All / Deselect All controls */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedKeys.size} of {totalSelectable} features selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="text-xs"
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={deselectAll}
                disabled={selectedKeys.size === 0}
                className="text-xs"
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Feature groups by category */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto rounded-lg border divide-y">
            {BUNDLEABLE_CATEGORIES.map((category) => {
              const items = (allFeatures?.[category as keyof typeof allFeatures] ?? []) as FeatureItemWithOrigin[]
              if (items.length === 0) return null

              const meta = TEMPLATE_CATEGORY_META[category]
              const Icon = meta.icon
              const isExpanded = expandedGroups.has(category)

              /** Only count selectable items for the group header counters */
              const selectableInGroup = items.filter((i) => !i.isFromTemplate)
              const selectedInGroup = selectableInGroup.filter((i) =>
                selectedKeys.has(`${category}:${i.id}`)
              ).length
              const allInGroupSelected =
                selectableInGroup.length > 0 && selectedInGroup === selectableInGroup.length

              return (
                <div key={category}>
                  {/* Category header — click to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(category)}
                    className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium flex-1 text-left">
                      {meta.label}s
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedInGroup}/{selectableInGroup.length}
                    </span>
                    {/* Toggle all selectable in group */}
                    {selectableInGroup.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleCategoryAll(category)
                        }}
                        className={cn(
                          'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                          allInGroupSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : selectedInGroup > 0
                              ? 'bg-primary/20 border-primary/50'
                              : 'border-border'
                        )}
                      >
                        {allInGroupSelected && <Check className="h-3 w-3" />}
                      </button>
                    )}
                  </button>

                  {/* Feature list — shown when expanded */}
                  {isExpanded && (
                    <div className="pb-2 px-4">
                      {items.map((item) => {
                        const isBlocked = item.isFromTemplate
                        const isSelected = !isBlocked && selectedKeys.has(`${category}:${item.id}`)
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (!isBlocked) toggleFeature(category, item.id)
                            }}
                            disabled={isBlocked}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                              isBlocked
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-muted/50',
                              isSelected && 'bg-primary/5'
                            )}
                          >
                            <div
                              className={cn(
                                'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                isBlocked
                                  ? 'border-yellow-500/50 bg-yellow-500/10'
                                  : isSelected
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-border'
                              )}
                            >
                              {isBlocked ? (
                                <AlertTriangle className="h-2.5 w-2.5 text-yellow-600" />
                              ) : (
                                isSelected && <Check className="h-3 w-3" />
                              )}
                            </div>
                            <span className={cn('flex-1 truncate', isBlocked && 'line-through')}>
                              {item.name}
                            </span>
                            {isBlocked && (
                              <span className="text-[10px] text-yellow-600 shrink-0">
                                Installed
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Navigation — Confirm advances to next step */}
      <div className="flex items-center justify-end pt-2">
        <Button
          onClick={handleConfirm}
          disabled={selectedKeys.size === 0}
        >
          Continue with {selectedKeys.size} feature{selectedKeys.size !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  )
}
