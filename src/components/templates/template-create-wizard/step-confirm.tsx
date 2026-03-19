/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — STEP 4: CONFIRM & PUBLISH
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: StepConfirm, TemplateConfirmStep
 *
 * WHY: Final review step before creating the template. Shows a summary of
 * the template name, category, items to bundle, and dependency choices.
 * Offers two actions: "Save as Draft" and "Save & Publish".
 *
 * HOW: Reads wizard state from context (feature, dependencies, metadata),
 * renders a summary, then orchestrates the 3-step creation flow:
 * 1. Create DRAFT template via templates.create
 * 2. Bundle the feature + selected deps via templates.bundleFeature
 * 3. Optionally publish via templates.publish
 */

'use client'

import { useState } from 'react'
import {
  Loader2,
  CheckCircle2,
  FileDown,
  Globe,
  Package,
  Database,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import { useTemplateLibrary } from '../template-library-context'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// CONFIRM STATUS — Tracks the creation lifecycle
// ============================================================================

type ConfirmStatus = 'idle' | 'creating' | 'bundling' | 'publishing' | 'success' | 'error'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step 4 — Review everything and create the template.
 *
 * Summary shows:
 * - Template name, description, tags (from step 3 metadata)
 * - Feature type and category
 * - Dependency handling choice
 *
 * Two primary actions:
 * - "Save as Draft" — creates + bundles with DRAFT status
 * - "Save & Publish" — creates + bundles + publishes (immediately visible)
 */
export function StepConfirm() {
  const {
    wizardSelectedFeature,
    wizardDependencySelection,
    wizardMetadata,
    wizardIncludeCmsRows,
    organizationId,
    goBack,
    reset,
  } = useTemplateLibrary()

  const [status, setStatus] = useState<ConfirmStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Whether the last creation was published or just a draft */
  const [wasPublished, setWasPublished] = useState(false)

  /** tRPC mutations for the 3-step flow */
  const createMutation = trpc.templates.create.useMutation()
  const bundleMutation = trpc.templates.bundleFeature.useMutation()
  const publishMutation = trpc.templates.publish.useMutation()

  /** Cache invalidation after successful creation */
  const utils = trpc.useUtils()

  /** Get category metadata for display */
  const categoryMeta = wizardSelectedFeature
    ? TEMPLATE_CATEGORY_META[wizardSelectedFeature.featureType]
    : null
  const CategoryIcon = categoryMeta?.icon

  /** Dependency choice label for display */
  const depChoiceLabel = wizardDependencySelection?.choice === 'bundle_all'
    ? 'Bundle all dependencies'
    : wizardDependencySelection?.choice === 'skip_all'
      ? 'No dependencies included'
      : `${wizardDependencySelection?.selectedIds.length ?? 0} dependencies selected`

  /**
   * Handle template creation — orchestrates the full 3-step flow.
   * 1. Create DRAFT template with metadata
   * 2. Bundle the selected feature into the template
   * 3. Optionally publish
   *
   * @param publish - Whether to immediately publish after creation
   */
  const handleCreate = async (publish: boolean) => {
    if (!wizardSelectedFeature || !wizardMetadata) return

    setStatus('creating')
    setErrorMessage(null)
    setWasPublished(publish)

    try {
      /** Step 1: Create the DRAFT template */
      const template = await createMutation.mutateAsync({
        organizationId,
        name: wizardMetadata.name,
        description: wizardMetadata.description || '',
        category: wizardSelectedFeature.featureType,
        thumbnailUrl: wizardMetadata.thumbnailUrl || null,
        tags: wizardMetadata.tags.length > 0 ? wizardMetadata.tags : undefined,
      })

      /** Step 2: Bundle the feature (with dependency selection + optional CMS row data) into the template */
      setStatus('bundling')
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

      /** Step 3: Optionally publish the template */
      if (publish) {
        setStatus('publishing')
        await publishMutation.mutateAsync({
          organizationId,
          templateId: template.id,
        })
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

  /** Success State */
  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <div>
          <h3 className="text-lg font-semibold">Template Created</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your template has been successfully created and is now available
            {wasPublished ? ' in the library' : ' as a draft'}.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={reset}>
            Back to Library
          </Button>
        </div>
      </div>
    )
  }

  /** Status label for the loading state */
  const statusLabel =
    status === 'creating' ? 'Creating template...'
    : status === 'bundling' ? 'Bundling feature...'
    : status === 'publishing' ? 'Publishing...'
    : null

  return (
    <div className="space-y-6 pt-4">
      {/* Summary Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Template Summary</h3>

        {/* Category + Feature Type */}
        {categoryMeta && CategoryIcon && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <CategoryIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{categoryMeta.label} Template</p>
              <p className="text-xs text-muted-foreground">{categoryMeta.description}</p>
            </div>
          </div>
        )}

        <Separator />

        {/* Metadata from Step 3 */}
        {wizardMetadata && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">{wizardMetadata.name}</p>
            {wizardMetadata.description && (
              <p className="text-xs text-muted-foreground">{wizardMetadata.description}</p>
            )}
            {wizardMetadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {wizardMetadata.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dependency Choice */}
        <div className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{depChoiceLabel}</span>
        </div>

        {/* CMS Data Inclusion — only shown when the user opted in */}
        {wizardIncludeCmsRows && (
          <div className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">CMS table data will be included</span>
          </div>
        )}
      </div>

      {/* Error State */}
      {status === 'error' && errorMessage && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Loading State */}
      {statusLabel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {statusLabel}
        </div>
      )}

      <Separator />

      {/* Action Buttons */}
      <div className="flex items-center gap-3 justify-end">
        <Button
          variant="outline"
          onClick={() => handleCreate(false)}
          disabled={status === 'creating' || status === 'bundling' || status === 'publishing'}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Save as Draft
        </Button>
        <Button
          onClick={() => handleCreate(true)}
          disabled={status === 'creating' || status === 'bundling' || status === 'publishing'}
        >
          <Globe className="h-4 w-4 mr-2" />
          Save & Publish
        </Button>
      </div>
    </div>
  )
}
