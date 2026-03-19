'use client'

/**
 * ============================================================================
 * WIZARD SETTINGS PANEL — Onboarding-Style Step Screens
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: WizardSettingsPanel, WizardFormValues,
 * WizardSettingsPanelProps, OnboardingStepWizard
 *
 * WHY: Renders the right side of the template wizard using an onboarding-style
 * screen-per-step architecture (like the platform onboarding flow). Each step
 * renders exclusively — only the active screen is visible. No collapsible
 * accordion sections.
 *
 * HOW:
 * - CREATE MODE: 5 step screens rendered conditionally via activeSection state.
 *   Step 0 = Select Feature, Step 1 = Dependencies, Step 2 = Metadata,
 *   Step 3 = Pricing, Step 4 = Review & Publish. Auto-advance via useEffect
 *   when the embedded step components write to wizard context.
 *
 * - EDIT MODE: Single metadata form screen, pre-populated from editTemplate.
 *
 * ARCHITECTURE: Same pattern as src/app/(main)/onboarding/_components/
 * onboarding-container.tsx — conditional rendering, lifted state,
 * Back/Continue navigation.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  X,
  Plus,
  ImageIcon,
  Loader2,
  FileDown,
  Globe,
  Package,
  Database,
  CheckCircle2,
  ArrowLeft,
  Gift,
  DollarSign,
  Info,
} from 'lucide-react'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/editor'
import { LexicalStaticContent } from '@/components/editor/lexical-static-content'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'

import {
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_MAX_TAGS,
  TEMPLATE_CATEGORY_META,
} from '@/lib/templates/constants'
import type { TemplateCategory, TemplateDetail } from '@/lib/templates/types'
import { useTemplateLibrary } from '../template-library-context'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'

import { StepSelectFeature } from '../template-create-wizard/step-select-feature'
import { StepDependencyReview } from '../template-create-wizard/step-dependency-review'
import { StepBlueprintFeatures } from '../template-create-wizard/step-blueprint-features'

// ============================================================================
// EXPORTED TYPES — Live form values passed to the preview panel
// ============================================================================

/**
 * Live form values passed to the preview panel for realtime updates.
 * The preview card/detail components consume these to render a live preview
 * as the user fills out the metadata form.
 *
 * SOURCE OF TRUTH KEYWORDS: WizardFormValues, TemplateWizardFormValues
 */
export interface WizardFormValues {
  name: string
  description: string
  thumbnailUrl: string
  tags: string[]
  category: TemplateCategory | null
  organizationName: string
  /** Price in cents — null or 0 means free (fed to preview panel for price badge) */
  price: number | null
}

// ============================================================================
// PROPS
// ============================================================================

/**
 * Props for the WizardSettingsPanel component.
 *
 * SOURCE OF TRUTH KEYWORDS: WizardSettingsPanelProps
 */
interface WizardSettingsPanelProps {
  /** Whether the panel is in create or edit mode */
  mode: 'create' | 'edit'
  /** Existing template data for edit mode — pre-populates the form */
  editTemplate?: TemplateDetail
  /** Organization ID for data fetching and mutations */
  organizationId: string
  /** Callback fired when the wizard flow completes (create success or edit save) */
  onComplete: () => void
  /** Callback fired whenever the form values change — feeds the preview panel */
  onFormChange: (values: WizardFormValues) => void
}

// ============================================================================
// FORM SCHEMA — Same validation schema as the original step-metadata
// ============================================================================

/**
 * Zod validation schema for template metadata.
 * Enforces a required name and optional description/tags/thumbnail.
 */
const templateMetadataSchema = z.object({
  name: z
    .string()
    .min(1, 'Template name is required')
    .max(TEMPLATE_NAME_MAX_LENGTH, `Name must be ${TEMPLATE_NAME_MAX_LENGTH} characters or less`),
  description: z
    .string()
    .optional()
    .or(z.literal('')),
  tags: z.array(z.string()).max(TEMPLATE_MAX_TAGS, `Maximum ${TEMPLATE_MAX_TAGS} tags`),
  thumbnailUrl: z.string().optional().or(z.literal('')),
})

type MetadataFormValues = z.infer<typeof templateMetadataSchema>

// ============================================================================
// CONFIRM STATUS — Tracks the creation lifecycle for the review step
// ============================================================================

type ConfirmStatus = 'idle' | 'creating' | 'bundling' | 'publishing' | 'success' | 'error'

/** Total number of steps in create mode (Feature, Dependencies, Metadata, Pricing, Review) */
const CREATE_TOTAL_STEPS = 5

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * WizardSettingsPanel — Onboarding-style step screens for the template wizard.
 *
 * In CREATE mode: 5 step screens rendered conditionally (one at a time).
 * In EDIT mode: Single metadata form screen.
 */
export function WizardSettingsPanel({
  mode,
  editTemplate,
  organizationId,
  onComplete,
  onFormChange,
}: WizardSettingsPanelProps) {
  if (mode === 'edit') {
    return (
      <EditModePanel
        editTemplate={editTemplate}
        organizationId={organizationId}
        onComplete={onComplete}
        onFormChange={onFormChange}
      />
    )
  }

  return (
    <CreateModePanel
      organizationId={organizationId}
      onComplete={onComplete}
      onFormChange={onFormChange}
    />
  )
}

// ============================================================================
// CREATE MODE PANEL — 4 onboarding-style step screens
// ============================================================================

/**
 * Create mode renders 5 step screens (like onboarding-container.tsx).
 * Each screen renders exclusively — only the active step is visible.
 * Auto-advances when embedded step components write to wizard context.
 */
function CreateModePanel({
  organizationId,
  onComplete,
  onFormChange,
}: {
  organizationId: string
  onComplete: () => void
  onFormChange: (values: WizardFormValues) => void
}) {
  const {
    wizardSelectedFeature,
    wizardDependencySelection,
    wizardMetadata,
    wizardIncludeCmsRows,
    wizardPrice,
    setWizardMetadata,
    setWizardPrice,
  } = useTemplateLibrary()

  /** Get the active org name for the preview card */
  const { activeOrganization } = useActiveOrganization()
  const orgName = activeOrganization?.name ?? 'My Organization'

  /** Track which step screen is currently visible (0-indexed) */
  const [activeSection, setActiveSection] = useState(0)

  /**
   * Wrap onFormChange to inject the current wizardPrice into every update.
   * This ensures the preview panel always has the latest price for the badge.
   */
  const handleFormChange = useCallback(
    (values: Omit<WizardFormValues, 'price'>) => {
      onFormChange({ ...values, price: wizardPrice })
    },
    [onFormChange, wizardPrice]
  )

  /**
   * Previous value refs — track last known context values to detect
   * when embedded step components write new selections. Using !== instead
   * of null checks so re-selections (going back and picking again) also
   * trigger auto-advance.
   */
  const prevFeatureRef = useRef(wizardSelectedFeature)
  const prevDepsRef = useRef(wizardDependencySelection)

  /**
   * Auto-advance Step 0 → 1 when the user selects a feature.
   * Fires on any new selection (not just null → non-null).
   */
  useEffect(() => {
    if (wizardSelectedFeature && wizardSelectedFeature !== prevFeatureRef.current) {
      setActiveSection(1)
    }
    prevFeatureRef.current = wizardSelectedFeature
  }, [wizardSelectedFeature])

  /**
   * Auto-advance Step 1 → 2 when dependency selection is made.
   * Fires on any new selection (not just null → non-null).
   */
  useEffect(() => {
    if (wizardDependencySelection && wizardDependencySelection !== prevDepsRef.current) {
      setActiveSection(2)
    }
    prevDepsRef.current = wizardDependencySelection
  }, [wizardDependencySelection])

  return (
    <div className="space-y-8">
      {/* Step indicator — minimal, like the onboarding flow */}
      <p className="text-sm text-muted-foreground">
        Step {activeSection + 1} of {CREATE_TOTAL_STEPS}
      </p>

      {/* Step 1: Select Feature — component renders its own heading and selection UI */}
      {activeSection === 0 && <StepSelectFeature />}

      {/*
       * Step 2: Dependencies OR Blueprint Feature Selector
       * Blueprint mode shows a multi-feature selector instead of dependency review,
       * since blueprints bundle ALL selected features (not just one feature's deps).
       */}
      {activeSection === 1 && (
        <div className="space-y-6">
          {wizardSelectedFeature?.featureType === 'BLUEPRINT' ? (
            <StepBlueprintFeatures />
          ) : (
            <StepDependencyReview />
          )}
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveSection(0)}
              className="gap-1.5 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Template Details — metadata form with Back/Continue */}
      {activeSection === 2 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Template Details
            </h2>
            <p className="text-sm text-muted-foreground">
              Add a name, description, tags, and thumbnail for your template.
            </p>
          </div>
          <MetadataFormSection
            organizationId={organizationId}
            orgName={orgName}
            category={wizardSelectedFeature?.featureType ?? null}
            initialMetadata={wizardMetadata}
            onFormChange={handleFormChange}
            onBack={() => setActiveSection(1)}
            onContinue={(metadata) => {
              setWizardMetadata({ ...metadata, price: wizardPrice })
              setActiveSection(3)
            }}
          />
        </div>
      )}

      {/* Step 4: Pricing — choose free or paid with price input */}
      {activeSection === 3 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Pricing
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose whether your template is free or paid.
            </p>
          </div>
          <PricingStepSection
            initialPrice={wizardPrice}
            hasStripeConnect={Boolean(activeOrganization?.stripeConnectedAccountId)}
            onBack={() => setActiveSection(2)}
            onContinue={(priceInCents) => {
              setWizardPrice(priceInCents)
              setActiveSection(4)
            }}
          />
        </div>
      )}

      {/* Step 5: Review & Publish — summary with Back/actions */}
      {activeSection === 4 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Review & Publish
            </h2>
            <p className="text-sm text-muted-foreground">
              Review your template and choose to save as draft or publish.
            </p>
          </div>
          <ReviewSection
            organizationId={organizationId}
            onBack={() => setActiveSection(3)}
            onComplete={onComplete}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EDIT MODE PANEL — Single metadata form screen
// ============================================================================

/**
 * Edit mode renders only the metadata form, pre-populated from editTemplate.
 * No step screens needed — just a clean form with heading.
 */
function EditModePanel({
  editTemplate,
  organizationId,
  onComplete,
  onFormChange,
}: {
  editTemplate?: TemplateDetail
  organizationId: string
  onComplete: () => void
  onFormChange: (values: WizardFormValues) => void
}) {
  const utils = trpc.useUtils()

  /** Get the active org name for the preview card */
  const { activeOrganization } = useActiveOrganization()
  const orgName = activeOrganization?.name ?? 'My Organization'

  /** Platform currency for the pricing section */
  const { symbol } = usePlatformCurrency()

  /** Whether Stripe Connect is set up — paid templates require this */
  const hasStripeConnect = Boolean(activeOrganization?.stripeConnectedAccountId)

  /** Tag input state */
  const [tagInput, setTagInput] = useState('')
  /** Storage browser modal state */
  const [storageBrowserOpen, setStorageBrowserOpen] = useState(false)

  /**
   * Pricing state — separate from the react-hook-form schema because pricing
   * uses choice cards + a dollar input, not a standard form field.
   */
  const [pricingChoice, setPricingChoice] = useState<'free' | 'paid'>(
    editTemplate?.price && editTemplate.price > 0 && hasStripeConnect ? 'paid' : 'free'
  )
  const [dollarAmount, setDollarAmount] = useState<string>(
    editTemplate?.price && editTemplate.price > 0
      ? (editTemplate.price / 100).toFixed(2)
      : ''
  )

  /** Parse the dollar string to cents, clamped to 0 minimum */
  const parseCents = (): number => {
    const parsed = parseFloat(dollarAmount)
    if (isNaN(parsed) || parsed <= 0) return 0
    return Math.round(parsed * 100)
  }

  /** Resolve the current price in cents based on the pricing choice */
  const currentPriceCents = pricingChoice === 'free' ? null : (parseCents() > 0 ? parseCents() : null)

  /** tRPC update mutation */
  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate()
      utils.templates.browseLibrary.invalidate()
      utils.templates.getLibraryDetail.invalidate()
      onComplete()
    },
  })

  /** Initialize form with existing template values */
  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(templateMetadataSchema),
    defaultValues: {
      name: editTemplate?.name ?? '',
      description: editTemplate?.description ?? '',
      tags: editTemplate?.tags ?? [],
      thumbnailUrl: editTemplate?.thumbnailUrl ?? '',
    },
  })

  /** Watch form values and feed to onFormChange for live preview */
  const watchedValues = form.watch()
  useEffect(() => {
    onFormChange({
      name: watchedValues.name,
      description: watchedValues.description ?? '',
      thumbnailUrl: watchedValues.thumbnailUrl ?? '',
      tags: watchedValues.tags,
      category: editTemplate?.category ?? null,
      organizationName: orgName,
      price: currentPriceCents,
    })
  }, [
    watchedValues.name,
    watchedValues.description,
    watchedValues.thumbnailUrl,
    watchedValues.tags,
    editTemplate?.category,
    currentPriceCents,
    orgName,
    onFormChange,
  ])

  /** Add a tag to the list */
  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (!trimmed) return
    const current = form.getValues('tags')
    if (current.includes(trimmed)) return
    if (current.length >= TEMPLATE_MAX_TAGS) return
    form.setValue('tags', [...current, trimmed])
    setTagInput('')
  }

  /** Remove a tag by value */
  const removeTag = (tag: string) => {
    const current = form.getValues('tags')
    form.setValue('tags', current.filter((t) => t !== tag))
  }

  /** Handle tag input keydown — add on Enter */
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  /** Handle form submission — call update mutation with metadata + price */
  const handleSave = form.handleSubmit((values) => {
    if (!editTemplate) return
    updateMutation.mutate({
      organizationId,
      templateId: editTemplate.id,
      name: values.name,
      description: values.description || '',
      thumbnailUrl: values.thumbnailUrl || null,
      tags: values.tags.length > 0 ? values.tags : undefined,
      price: currentPriceCents,
    })
  })

  return (
    <div className="space-y-6">
      {/* Heading — minimal, no step indicator in edit mode */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Edit Template</h2>
        <p className="text-sm text-muted-foreground">
          Update your template details and pricing.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={handleSave} className="space-y-5">
          {/* Template Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Template Name *</FormLabel>
                <FormControl>
                  <Input placeholder="My Awesome Template" {...field} />
                </FormControl>
                <FormDescription>
                  {field.value.length}/{TEMPLATE_NAME_MAX_LENGTH} characters
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description — Lexical rich text editor with hideColor */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <div className="rounded-lg bg-muted/30 min-h-[140px]">
                    <RichTextEditor
                      initialContent={field.value || undefined}
                      onChange={(content) => field.onChange(content)}
                      variant="standard"
                      hideColor
                      placeholder="Describe what this template includes and when to use it..."
                      organizationId={organizationId}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tags */}
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addTag}
                    disabled={field.value.length >= TEMPLATE_MAX_TAGS}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {field.value.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {field.value.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-0.5 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <FormDescription>
                  {field.value.length}/{TEMPLATE_MAX_TAGS} tags
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Thumbnail */}
          <FormField
            control={form.control}
            name="thumbnailUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Thumbnail</FormLabel>
                <div className="flex items-center gap-3">
                  {field.value ? (
                    <div className="relative h-20 w-32 overflow-hidden rounded-lg">
                      <img
                        src={field.value}
                        alt="Template thumbnail"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => form.setValue('thumbnailUrl', '')}
                        className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStorageBrowserOpen(true)}
                      className="gap-2"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Choose Image
                    </Button>
                  )}
                </div>
                <FormDescription>
                  Optional thumbnail shown in the template library
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Pricing — Free/Paid choice cards with price input (same UI as create wizard) */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Pricing</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Free choice card */}
              <button
                type="button"
                onClick={() => setPricingChoice('free')}
                className={cn(
                  'flex flex-col items-center gap-2 p-5 text-center',
                  'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl',
                  'dark:border-t dark:ring-background dark:shadow-sm',
                  'ring-1 transition-shadow duration-200',
                  pricingChoice === 'free'
                    ? 'ring-primary dark:ring-primary'
                    : 'ring-border dark:ring-1 hover:ring-primary/50'
                )}
              >
                <Gift
                  className={cn(
                    'h-6 w-6',
                    pricingChoice === 'free' ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="text-sm font-medium">Free</span>
                <span className="text-xs text-muted-foreground">
                  Anyone can install this template
                </span>
              </button>

              {/* Paid choice card — disabled when Stripe Connect is not set up */}
              <button
                type="button"
                onClick={() => hasStripeConnect && setPricingChoice('paid')}
                disabled={!hasStripeConnect}
                className={cn(
                  'flex flex-col items-center gap-2 p-5 text-center',
                  'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl',
                  'dark:border-t dark:ring-background dark:shadow-sm',
                  'ring-1 transition-shadow duration-200',
                  !hasStripeConnect
                    ? 'opacity-50 cursor-not-allowed'
                    : pricingChoice === 'paid'
                      ? 'ring-primary dark:ring-primary'
                      : 'ring-border dark:ring-1 hover:ring-primary/50'
                )}
              >
                <DollarSign
                  className={cn(
                    'h-6 w-6',
                    pricingChoice === 'paid' && hasStripeConnect ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="text-sm font-medium">Paid</span>
                <span className="text-xs text-muted-foreground">
                  {hasStripeConnect
                    ? 'Set a price for your template'
                    : 'Connect Stripe to sell templates'}
                </span>
              </button>
            </div>

            {/* Stripe Connect required notice — shown when paid is unavailable */}
            {!hasStripeConnect && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  To sell paid templates, you need to connect your Stripe account first.
                  Head over to <span className="font-medium text-foreground">Settings &rarr; Integrations &rarr; Stripe Connect</span> to get set up.
                </p>
              </div>
            )}

            {/* Price input — only shown when "Paid" is selected */}
            {pricingChoice === 'paid' && (
              <div className="space-y-2">
                <div className="relative">
                  {/* Currency symbol prefix */}
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.50"
                    placeholder="9.99"
                    value={dollarAmount}
                    onChange={(e) => setDollarAmount(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the price in dollars. Minimum {symbol}0.50.
                </p>
              </div>
            )}

            {/* Approval notice for paid templates */}
            {pricingChoice === 'paid' && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Paid templates may require approval before appearing in the marketplace.
                </p>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </Form>

      {/* Storage Browser Modal — for thumbnail selection */}
      <StorageBrowserModal
        open={storageBrowserOpen}
        onOpenChange={setStorageBrowserOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        onSelect={(file) => {
          const selected = Array.isArray(file) ? file[0] : file
          if (selected?.accessUrl) {
            form.setValue('thumbnailUrl', selected.accessUrl)
          }
          setStorageBrowserOpen(false)
        }}
      />
    </div>
  )
}

// ============================================================================
// METADATA FORM SECTION — Used by Step 3 in create mode
// ============================================================================

/**
 * Metadata form for create mode. Handles name, description, tags, thumbnail.
 * Feeds live values to the preview panel via onFormChange.
 * Has Back button to navigate to previous step and Continue to advance.
 *
 * Accepts `initialMetadata` from wizard context so that navigating back
 * from the Review step restores previously entered values instead of
 * resetting the form to empty defaults.
 */
function MetadataFormSection({
  organizationId,
  orgName,
  category,
  initialMetadata,
  onFormChange,
  onBack,
  onContinue,
}: {
  organizationId: string
  orgName: string
  category: TemplateCategory | null
  /** Previously saved metadata from context — restores form on back navigation */
  initialMetadata: { name: string; description: string; tags: string[]; thumbnailUrl: string } | null
  /** Receives form values without price — price is injected by the parent wrapper */
  onFormChange: (values: Omit<WizardFormValues, 'price'>) => void
  onBack: () => void
  onContinue: (metadata: {
    name: string
    description: string
    tags: string[]
    thumbnailUrl: string
  }) => void
}) {
  /** Tag input state */
  const [tagInput, setTagInput] = useState('')
  /** Storage browser modal state */
  const [storageBrowserOpen, setStorageBrowserOpen] = useState(false)

  /**
   * Initialize form with saved metadata if available (back navigation),
   * otherwise start with empty defaults (first visit).
   */
  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(templateMetadataSchema),
    defaultValues: {
      name: initialMetadata?.name ?? '',
      description: initialMetadata?.description ?? '',
      tags: initialMetadata?.tags ?? [],
      thumbnailUrl: initialMetadata?.thumbnailUrl ?? '',
    },
  })

  /** Watch form values and feed to onFormChange for live preview */
  const watchedValues = form.watch()
  useEffect(() => {
    onFormChange({
      name: watchedValues.name,
      description: watchedValues.description ?? '',
      thumbnailUrl: watchedValues.thumbnailUrl ?? '',
      tags: watchedValues.tags,
      category,
      organizationName: orgName,
    })
  }, [
    watchedValues.name,
    watchedValues.description,
    watchedValues.thumbnailUrl,
    watchedValues.tags,
    category,
    orgName,
    onFormChange,
  ])

  /** Add a tag to the list */
  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (!trimmed) return
    const current = form.getValues('tags')
    if (current.includes(trimmed)) return
    if (current.length >= TEMPLATE_MAX_TAGS) return
    form.setValue('tags', [...current, trimmed])
    setTagInput('')
  }

  /** Remove a tag by value */
  const removeTag = (tag: string) => {
    const current = form.getValues('tags')
    form.setValue('tags', current.filter((t) => t !== tag))
  }

  /** Handle tag input keydown — add on Enter */
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  /** Handle form submission — save to context and advance to review */
  const handleContinue = form.handleSubmit((values) => {
    onContinue({
      name: values.name,
      description: values.description ?? '',
      tags: values.tags,
      thumbnailUrl: values.thumbnailUrl ?? '',
    })
  })

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleContinue} className="space-y-5">
          {/* Template Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Template Name *</FormLabel>
                <FormControl>
                  <Input placeholder="My Awesome Template" {...field} />
                </FormControl>
                <FormDescription>
                  {field.value.length}/{TEMPLATE_NAME_MAX_LENGTH} characters
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description — Lexical rich text editor with hideColor */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <div className="rounded-lg bg-muted/30 min-h-[140px]">
                    <RichTextEditor
                      initialContent={field.value || undefined}
                      onChange={(content) => field.onChange(content)}
                      variant="standard"
                      hideColor
                      placeholder="Describe what this template includes and when to use it..."
                      organizationId={organizationId}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Tags */}
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addTag}
                    disabled={field.value.length >= TEMPLATE_MAX_TAGS}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {field.value.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {field.value.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-0.5 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <FormDescription>
                  {field.value.length}/{TEMPLATE_MAX_TAGS} tags
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Thumbnail */}
          <FormField
            control={form.control}
            name="thumbnailUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Thumbnail</FormLabel>
                <div className="flex items-center gap-3">
                  {field.value ? (
                    <div className="relative h-20 w-32 overflow-hidden rounded-lg">
                      <img
                        src={field.value}
                        alt="Template thumbnail"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => form.setValue('thumbnailUrl', '')}
                        className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStorageBrowserOpen(true)}
                      className="gap-2"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Choose Image
                    </Button>
                  )}
                </div>
                <FormDescription>
                  Optional thumbnail shown in the template library
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Navigation — Back and Continue */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="gap-1.5 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </Form>

      {/* Storage Browser Modal — for thumbnail selection */}
      <StorageBrowserModal
        open={storageBrowserOpen}
        onOpenChange={setStorageBrowserOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        onSelect={(file) => {
          const selected = Array.isArray(file) ? file[0] : file
          if (selected?.accessUrl) {
            form.setValue('thumbnailUrl', selected.accessUrl)
          }
          setStorageBrowserOpen(false)
        }}
      />
    </>
  )
}

// ============================================================================
// PRICING STEP SECTION — Used by Step 4 (index 3) in create mode
// ============================================================================

/**
 * Pricing step — lets the user choose between free and paid template.
 * When "Paid" is selected, shows a price input with platform currency symbol.
 * User types in dollars; value is stored as cents (multiplied by 100).
 *
 * Uses the same ChoiceCard design pattern from step-dependency-review.tsx:
 * ring-1/ring-border, rounded-xl, bg-card, dark:bg-muted/40.
 *
 * SOURCE OF TRUTH KEYWORDS: PricingStepSection, TemplatePricingStep
 */
function PricingStepSection({
  initialPrice,
  hasStripeConnect,
  onBack,
  onContinue,
}: {
  /** Previously saved price from context — restores state on back navigation */
  initialPrice: number | null
  /** Whether Stripe Connect is set up — paid templates require this */
  hasStripeConnect: boolean
  onBack: () => void
  /** Callback with price in cents (0 or null = free) */
  onContinue: (priceInCents: number | null) => void
}) {
  /** Platform currency for the input prefix symbol */
  const { symbol } = usePlatformCurrency()

  /** Whether the user selected "Free" or "Paid" — forced to 'free' if no Stripe Connect */
  const [pricingChoice, setPricingChoice] = useState<'free' | 'paid'>(
    initialPrice && initialPrice > 0 && hasStripeConnect ? 'paid' : 'free'
  )

  /**
   * Dollar amount string for the input field.
   * Stored as a string to allow natural typing (e.g., "9.99").
   * Converted to cents on continue.
   */
  const [dollarAmount, setDollarAmount] = useState<string>(
    initialPrice && initialPrice > 0
      ? (initialPrice / 100).toFixed(2)
      : ''
  )

  /** Parse the dollar string to cents, clamped to 0 minimum */
  const parseCents = (): number => {
    const parsed = parseFloat(dollarAmount)
    if (isNaN(parsed) || parsed <= 0) return 0
    return Math.round(parsed * 100)
  }

  /** Handle continue — compute cents and advance */
  const handleContinue = () => {
    if (pricingChoice === 'free') {
      onContinue(null)
    } else {
      const cents = parseCents()
      onContinue(cents > 0 ? cents : null)
    }
  }

  /** Disable continue when "Paid" is selected but no valid price entered */
  const isNextDisabled =
    pricingChoice === 'paid' && parseCents() === 0

  return (
    <div className="space-y-6">
      {/* Two choice cards — Free and Paid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Free choice card */}
        <button
          type="button"
          onClick={() => setPricingChoice('free')}
          className={cn(
            'flex flex-col items-center gap-2 p-5 text-center',
            'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl',
            'dark:border-t dark:ring-background dark:shadow-sm',
            'ring-1 transition-shadow duration-200',
            pricingChoice === 'free'
              ? 'ring-primary dark:ring-primary'
              : 'ring-border dark:ring-1 hover:ring-primary/50'
          )}
        >
          <Gift
            className={cn(
              'h-6 w-6',
              pricingChoice === 'free' ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <span className="text-sm font-medium">Free</span>
          <span className="text-xs text-muted-foreground">
            Anyone can install this template
          </span>
        </button>

        {/* Paid choice card — disabled when Stripe Connect is not set up */}
        <button
          type="button"
          onClick={() => hasStripeConnect && setPricingChoice('paid')}
          disabled={!hasStripeConnect}
          className={cn(
            'flex flex-col items-center gap-2 p-5 text-center',
            'dark:bg-muted/40 backdrop-blur-lg bg-card rounded-xl',
            'dark:border-t dark:ring-background dark:shadow-sm',
            'ring-1 transition-shadow duration-200',
            !hasStripeConnect
              ? 'opacity-50 cursor-not-allowed'
              : pricingChoice === 'paid'
                ? 'ring-primary dark:ring-primary'
                : 'ring-border dark:ring-1 hover:ring-primary/50'
          )}
        >
          <DollarSign
            className={cn(
              'h-6 w-6',
              pricingChoice === 'paid' && hasStripeConnect ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <span className="text-sm font-medium">Paid</span>
          <span className="text-xs text-muted-foreground">
            {hasStripeConnect
              ? 'Set a price for your template'
              : 'Connect Stripe to sell templates'}
          </span>
        </button>
      </div>

      {/* Stripe Connect required notice — shown when paid is unavailable */}
      {!hasStripeConnect && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            To sell paid templates, you need to connect your Stripe account first.
            Head over to <span className="font-medium text-foreground">Settings &rarr; Integrations &rarr; Stripe Connect</span> to get set up.
          </p>
        </div>
      )}

      {/* Price input — only shown when "Paid" is selected */}
      {pricingChoice === 'paid' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Price</label>
          <div className="relative">
            {/* Currency symbol prefix */}
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {symbol}
            </span>
            <Input
              type="number"
              step="0.01"
              min="0.50"
              placeholder="9.99"
              value={dollarAmount}
              onChange={(e) => setDollarAmount(e.target.value)}
              className="pl-8"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the price in dollars. Minimum {symbol}0.50.
          </p>
        </div>
      )}

      {/* Navigation — Back and Continue */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={isNextDisabled}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// REVIEW SECTION — Used by Step 5 (index 4) in create mode
// ============================================================================

/**
 * Review step for create mode. Shows a summary of all wizard selections
 * and provides "Save as Draft" / "Save & Publish" actions.
 * Orchestrates the 3-step creation flow: create → bundle → publish.
 */
function ReviewSection({
  organizationId,
  onBack,
  onComplete,
}: {
  organizationId: string
  onBack: () => void
  onComplete: () => void
}) {
  const {
    wizardSelectedFeature,
    wizardDependencySelection,
    wizardMetadata,
    wizardIncludeCmsRows,
    wizardPrice,
    wizardBlueprintFeatures,
  } = useTemplateLibrary()

  /** Platform currency for formatting the price display */
  const { formatCurrency } = usePlatformCurrency()

  const [status, setStatus] = useState<ConfirmStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Tracks the final outcome: 'draft', 'published', or 'pending_approval' */
  const [outcome, setOutcome] = useState<'draft' | 'published' | 'pending_approval'>('draft')
  /** Tracks progress for blueprint bundling: "Bundling features... (X of Y)" */
  const [bundleProgress, setBundleProgress] = useState({ current: 0, total: 0 })

  /** tRPC mutations for the 3-step flow */
  const createMutation = trpc.templates.create.useMutation()
  const bundleMutation = trpc.templates.bundleFeature.useMutation()
  const publishMutation = trpc.templates.publish.useMutation()

  /** Cache invalidation after successful creation */
  const utils = trpc.useUtils()

  /** Whether this is a blueprint template (bundles multiple features) */
  const isBlueprint = wizardSelectedFeature?.featureType === 'BLUEPRINT'

  /** Get category metadata for display */
  const categoryMeta = wizardSelectedFeature
    ? TEMPLATE_CATEGORY_META[wizardSelectedFeature.featureType]
    : null
  const CategoryIcon = categoryMeta?.icon

  /** Dependency choice label for display (only shown for non-blueprint templates) */
  const depChoiceLabel = wizardDependencySelection?.choice === 'bundle_all'
    ? 'Bundle all dependencies'
    : wizardDependencySelection?.choice === 'skip_all'
      ? 'No dependencies included'
      : `${wizardDependencySelection?.selectedIds.length ?? 0} dependencies selected`

  /**
   * Group blueprint features by category for the review summary.
   * Returns a Map of category → feature names for organized display.
   */
  const blueprintGrouped = useMemo(() => {
    if (!isBlueprint || wizardBlueprintFeatures.length === 0) return null
    const grouped = new Map<string, string[]>()
    for (const f of wizardBlueprintFeatures) {
      const existing = grouped.get(f.featureType) ?? []
      existing.push(f.featureName)
      grouped.set(f.featureType, existing)
    }
    return grouped
  }, [isBlueprint, wizardBlueprintFeatures])

  /**
   * Handle template creation — orchestrates the full 3-step flow.
   * 1. Create DRAFT template with metadata
   * 2. Bundle feature(s) into the template
   *    - Single feature mode: one bundleFeature call
   *    - Blueprint mode: one bundleFeature call per selected feature
   * 3. Optionally publish
   */
  const handleCreate = async (publish: boolean) => {
    if (!wizardSelectedFeature || !wizardMetadata) return

    setStatus('creating')
    setErrorMessage(null)

    try {
      /** Step 1: Create the DRAFT template with optional price */
      const template = await createMutation.mutateAsync({
        organizationId,
        name: wizardMetadata.name,
        description: wizardMetadata.description || '',
        category: wizardSelectedFeature.featureType,
        thumbnailUrl: wizardMetadata.thumbnailUrl || null,
        tags: wizardMetadata.tags.length > 0 ? wizardMetadata.tags : undefined,
        price: wizardPrice,
      })

      /** Step 2: Bundle feature(s) with dependency selection */
      setStatus('bundling')

      if (isBlueprint && wizardBlueprintFeatures.length > 0) {
        /**
         * Blueprint mode — bundle each selected feature sequentially.
         * Each call creates a TemplateItem for that feature. Dependencies
         * within each feature are handled by the bundling service internally.
         */
        setBundleProgress({ current: 0, total: wizardBlueprintFeatures.length })
        for (let i = 0; i < wizardBlueprintFeatures.length; i++) {
          const feature = wizardBlueprintFeatures[i]
          setBundleProgress({ current: i + 1, total: wizardBlueprintFeatures.length })
          await bundleMutation.mutateAsync({
            organizationId,
            templateId: template.id,
            featureType: feature.featureType,
            featureId: feature.featureId,
            dependencySelection: { choice: 'skip_all', selectedIds: [] },
            includeCmsRows: wizardIncludeCmsRows,
          })
        }
      } else {
        /** Single feature mode — one bundleFeature call */
        await bundleMutation.mutateAsync({
          organizationId,
          templateId: template.id,
          featureType: wizardSelectedFeature.featureType,
          featureId: wizardSelectedFeature.featureId,
          dependencySelection: wizardDependencySelection ?? {
            choice: 'skip_all',
            selectedIds: [],
          },
          includeCmsRows: wizardIncludeCmsRows,
        })
      }

      /** Step 3: Optionally publish the template */
      if (publish) {
        setStatus('publishing')
        const published = await publishMutation.mutateAsync({
          organizationId,
          templateId: template.id,
        })
        /**
         * Check the returned status — paid templates with auto-approve OFF
         * come back as PENDING_APPROVAL instead of PUBLISHED.
         */
        setOutcome(published.status === 'PENDING_APPROVAL' ? 'pending_approval' : 'published')
      } else {
        setOutcome('draft')
      }

      /** All done — invalidate caches and show success */
      setStatus('success')
      utils.templates.browseLibrary.invalidate()
      utils.templates.list.invalidate()
    } catch (err) {
      setStatus('error')
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    }
  }

  /** Success State — message reflects actual outcome (draft/published/pending) */
  if (status === 'success') {
    const successMessage =
      outcome === 'pending_approval'
        ? 'Your template has been submitted for approval. It will appear in the marketplace once reviewed by an admin.'
        : outcome === 'published'
          ? 'Your template has been successfully created and published.'
          : 'Your template has been saved as a draft.'

    return (
      <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <h3 className="text-base font-semibold">
            {outcome === 'pending_approval' ? 'Submitted for Approval' : 'Template Created'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {successMessage}
          </p>
        </div>
        <Button variant="outline" onClick={onComplete} className="mt-2">
          Done
        </Button>
      </div>
    )
  }

  /** Status label for the loading state — shows progress for blueprint bundling */
  const statusLabel =
    status === 'creating' ? 'Creating template...'
    : status === 'bundling'
      ? isBlueprint && bundleProgress.total > 0
        ? `Bundling features... (${bundleProgress.current} of ${bundleProgress.total})`
        : 'Bundling feature...'
    : status === 'publishing' ? 'Publishing...'
    : null

  const isProcessing = status !== 'idle' && status !== 'error'

  return (
    <div className="space-y-6">
      {/*
       * Structured summary table — clean key/value rows grouped inside
       * a single card. Replaces the scattered loose elements.
       */}
      <div className="rounded-lg border divide-y">
        {/* Feature type row */}
        {categoryMeta && CategoryIcon && (
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CategoryIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{categoryMeta.label} Template</p>
              <p className="text-xs text-muted-foreground">{categoryMeta.description}</p>
            </div>
          </div>
        )}

        {/* Name row */}
        {wizardMetadata && (
          <div className="flex items-baseline justify-between gap-4 p-4">
            <span className="text-sm text-muted-foreground shrink-0">Name</span>
            <span className="text-sm font-medium text-right truncate">
              {wizardMetadata.name}
            </span>
          </div>
        )}

        {/* Description row — LexicalStaticContent for truly instant rendering (zero Lexical runtime) */}
        {wizardMetadata?.description && (
          <div className="p-4 space-y-1">
            <span className="text-sm text-muted-foreground">Description</span>
            <LexicalStaticContent
              content={wizardMetadata.description}
              maxHeight={200}
              className="text-sm"
            />
          </div>
        )}

        {/* Tags row */}
        {wizardMetadata && wizardMetadata.tags.length > 0 && (
          <div className="p-4 space-y-2">
            <span className="text-sm text-muted-foreground">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {wizardMetadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/*
         * Blueprint mode: Show grouped features by category instead of dependencies.
         * Each category group shows icon + label + feature count + list of names.
         */}
        {isBlueprint && blueprintGrouped ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Features Included</span>
              <span className="text-xs text-muted-foreground">
                {wizardBlueprintFeatures.length} total
              </span>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {Array.from(blueprintGrouped.entries()).map(([cat, names]) => {
                const meta = TEMPLATE_CATEGORY_META[cat as TemplateCategory]
                const CatIcon = meta?.icon
                return (
                  <div key={cat} className="flex items-start gap-2">
                    {CatIcon && (
                      <CatIcon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {meta?.label}s ({names.length})
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {names.join(', ')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Dependencies row — only for non-blueprint single feature templates */}
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm text-muted-foreground">Dependencies</span>
              <div className="flex items-center gap-1.5 text-sm">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{depChoiceLabel}</span>
              </div>
            </div>
          </>
        )}

        {/* CMS data row — only shown when opted in */}
        {wizardIncludeCmsRows && (
          <div className="flex items-center justify-between gap-4 p-4">
            <span className="text-sm text-muted-foreground">CMS Data</span>
            <div className="flex items-center gap-1.5 text-sm">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Table data included</span>
            </div>
          </div>
        )}

        {/* Pricing row */}
        <div className="flex items-center justify-between gap-4 p-4">
          <span className="text-sm text-muted-foreground">Pricing</span>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              {wizardPrice && wizardPrice > 0
                ? formatCurrency(wizardPrice)
                : 'Free'}
            </span>
          </div>
        </div>
      </div>

      {/* Approval notice for paid templates — outside the card for emphasis */}
      {wizardPrice && wizardPrice > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Paid templates require approval before appearing in the marketplace.
            Your template will be set to &quot;Pending Approval&quot; until reviewed.
          </span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && errorMessage && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Loading state */}
      {statusLabel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {statusLabel}
        </div>
      )}

      {/* Action buttons — Back on left, Draft + Publish on right */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={isProcessing}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => handleCreate(false)}
            disabled={isProcessing}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Save as Draft
          </Button>
          <Button
            onClick={() => handleCreate(true)}
            disabled={isProcessing}
          >
            <Globe className="h-4 w-4 mr-2" />
            Save & Publish
          </Button>
        </div>
      </div>
    </div>
  )
}

