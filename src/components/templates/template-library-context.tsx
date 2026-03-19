/**
 * ============================================================================
 * TEMPLATE LIBRARY — WIZARD CONTEXT & STATE MANAGEMENT
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateLibraryState, TemplateLibraryContext,
 * useTemplateLibrary, TemplateLibraryProvider, WizardState
 *
 * WHY: Context for the template create wizard and org-scoped views
 * (My Templates, Installed). Browse-related state has been moved to
 * TemplateBrowseContext (template-browse-context.tsx).
 *
 * HOW: React Context with wizard step state and org-level fields.
 * The provider wraps wizard dialogs, My Templates, and Installed tabs.
 *
 * WIZARD STATE: Steps communicate via shared wizard state fields:
 * - wizardSelectedFeature — set by Step 1 (Select Feature)
 * - wizardDependencySelection — set by Step 2 (Dependency Review)
 * - wizardMetadata — set by Step 3 (Metadata Form)
 * - Step 4 (Confirm) reads all three to create + bundle + optionally publish
 */

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { TemplateCategory, DependencySelection } from '@/lib/templates/types'

// ============================================================================
// WIZARD DATA TYPES — Shared between wizard steps via context
// ============================================================================

/** Feature selection from Step 1 */
export interface WizardSelectedFeature {
  featureType: TemplateCategory
  featureId: string
}

/** Metadata form values from Step 3 */
export interface WizardMetadata {
  name: string
  description: string
  tags: string[]
  thumbnailUrl: string
  /** Template price in cents — null or 0 means free */
  price: number | null
}

/**
 * A single feature selected for blueprint bundling.
 * SOURCE OF TRUTH KEYWORDS: BlueprintFeatureSelection
 */
export interface BlueprintFeatureItem {
  featureType: TemplateCategory
  featureId: string
  featureName: string
}

// ============================================================================
// STATE TYPES
// ============================================================================

/** View modes used by the context — browse state is now handled separately */
export type TemplateLibraryMode = 'browse' | 'create' | 'detail' | 'installed' | 'my_templates'

/**
 * State shape for the template library context.
 * Focuses on wizard state and org-level operations.
 */
export interface TemplateLibraryState {
  /** Current view mode — used by wizard navigation (goBack logic) */
  mode: TemplateLibraryMode
  /** Current step in the create wizard (0-indexed) */
  createWizardStep: number
  /** Pre-selected feature for "Save as Template" entry points */
  preselectedFeature?: { featureType: TemplateCategory; featureId: string }
  /** Organization ID for data fetching */
  organizationId: string

  /** Wizard Step 1 result — the feature the user selected */
  wizardSelectedFeature: WizardSelectedFeature | null
  /** Wizard Step 2 result — how the user wants to handle dependencies */
  wizardDependencySelection: DependencySelection | null
  /** Wizard Step 3 result — template metadata from the form */
  wizardMetadata: WizardMetadata | null
  /** Whether to include CMS table row data when bundling CMS dependencies */
  wizardIncludeCmsRows: boolean
  /** Template price in cents — null or 0 means free, set by pricing step */
  wizardPrice: number | null
  /** Blueprint mode — all features selected for bundling (only used when category is BLUEPRINT) */
  wizardBlueprintFeatures: BlueprintFeatureItem[]
}

/**
 * Dispatch functions exposed by the context.
 * Wizard-focused actions plus org-level navigation.
 */
export interface TemplateLibraryActions {
  /** Switch view modes (used by wizard and org views) */
  setMode: (mode: TemplateLibraryMode) => void
  /** Navigate to a specific create wizard step */
  setCreateStep: (step: number) => void
  /** Reset all state back to initial mode */
  reset: () => void
  /** Go back from create wizard to browse mode */
  goBack: () => void

  /** Set the wizard's selected feature (Step 1 → context) */
  setWizardSelectedFeature: (feature: WizardSelectedFeature | null) => void
  /** Set the wizard's dependency selection (Step 2 → context) */
  setWizardDependencySelection: (selection: DependencySelection | null) => void
  /** Set the wizard's metadata (Step 3 → context) */
  setWizardMetadata: (metadata: WizardMetadata | null) => void
  /** Toggle whether CMS row data is included in the bundle */
  setWizardIncludeCmsRows: (value: boolean) => void
  /** Set the template price in cents (null or 0 = free) */
  setWizardPrice: (price: number | null) => void
  /** Set the blueprint feature selections (blueprint mode only) */
  setWizardBlueprintFeatures: (features: BlueprintFeatureItem[]) => void
}

/** Combined context value — state + actions */
export type TemplateLibraryContextValue = TemplateLibraryState & TemplateLibraryActions

// ============================================================================
// CONTEXT
// ============================================================================

const TemplateLibraryContext = createContext<TemplateLibraryContextValue | null>(null)

// ============================================================================
// HOOK
// ============================================================================

/**
 * Access the template library state and actions from any child component.
 * Must be used within a TemplateLibraryProvider.
 */
export function useTemplateLibrary(): TemplateLibraryContextValue {
  const ctx = useContext(TemplateLibraryContext)
  if (!ctx) {
    throw new Error('useTemplateLibrary must be used within a TemplateLibraryProvider')
  }
  return ctx
}

// ============================================================================
// PROVIDER PROPS
// ============================================================================

export interface TemplateLibraryProviderProps {
  children: ReactNode
  organizationId: string
  /** Pre-select a feature for "Save as Template" flows */
  preselectedFeature?: { featureType: TemplateCategory; featureId: string }
}

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Wraps the wizard dialog, My Templates tab, and Installed tab.
 * Provides wizard state and org-level context to child components.
 *
 * If a preselectedFeature is provided, the wizard opens in create mode.
 */
export function TemplateLibraryProvider({
  children,
  organizationId,
  preselectedFeature,
}: TemplateLibraryProviderProps) {
  /** Determine initial mode based on whether a feature was preselected */
  const initialMode: TemplateLibraryMode = preselectedFeature ? 'create' : 'browse'

  const [mode, setMode] = useState<TemplateLibraryMode>(initialMode)
  const [createWizardStep, setCreateWizardStep] = useState(0)

  /** Wizard shared state — data flows between steps via these */
  const [wizardSelectedFeature, setWizardSelectedFeature] = useState<WizardSelectedFeature | null>(
    preselectedFeature ?? null
  )
  const [wizardDependencySelection, setWizardDependencySelection] = useState<DependencySelection | null>(null)
  const [wizardMetadata, setWizardMetadata] = useState<WizardMetadata | null>(null)
  /** Whether to include CMS table row data alongside schema when bundling */
  const [wizardIncludeCmsRows, setWizardIncludeCmsRows] = useState(false)
  /** Template price in cents — null means free (default) */
  const [wizardPrice, setWizardPrice] = useState<number | null>(null)
  /** Blueprint mode — selected features for bundling */
  const [wizardBlueprintFeatures, setWizardBlueprintFeatures] = useState<BlueprintFeatureItem[]>([])

  /** Reset everything back to the initial state */
  const handleReset = useCallback(() => {
    setMode('browse')
    setCreateWizardStep(0)
    setWizardSelectedFeature(preselectedFeature ?? null)
    setWizardDependencySelection(null)
    setWizardMetadata(null)
    setWizardIncludeCmsRows(false)
    setWizardPrice(null)
    setWizardBlueprintFeatures([])
  }, [preselectedFeature])

  /** Navigate back depending on current mode */
  const handleGoBack = useCallback(() => {
    if (mode === 'create') {
      setCreateWizardStep(0)
      setWizardSelectedFeature(preselectedFeature ?? null)
      setWizardDependencySelection(null)
      setWizardMetadata(null)
      setWizardIncludeCmsRows(false)
      setWizardPrice(null)
      setWizardBlueprintFeatures([])
      setMode('browse')
    } else {
      setMode('browse')
    }
  }, [mode, preselectedFeature])

  const value = useMemo<TemplateLibraryContextValue>(
    () => ({
      mode,
      createWizardStep,
      preselectedFeature,
      organizationId,
      wizardSelectedFeature,
      wizardDependencySelection,
      wizardMetadata,
      wizardIncludeCmsRows,
      wizardPrice,
      wizardBlueprintFeatures,
      setMode,
      setCreateStep: setCreateWizardStep,
      reset: handleReset,
      goBack: handleGoBack,
      setWizardSelectedFeature,
      setWizardDependencySelection,
      setWizardMetadata,
      setWizardIncludeCmsRows,
      setWizardPrice,
      setWizardBlueprintFeatures,
    }),
    [
      mode,
      createWizardStep,
      preselectedFeature,
      organizationId,
      wizardSelectedFeature,
      wizardDependencySelection,
      wizardMetadata,
      wizardIncludeCmsRows,
      wizardPrice,
      wizardBlueprintFeatures,
      handleReset,
      handleGoBack,
    ]
  )

  return (
    <TemplateLibraryContext.Provider value={value}>
      {children}
    </TemplateLibraryContext.Provider>
  )
}
