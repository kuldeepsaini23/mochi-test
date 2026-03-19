/**
 * ============================================================================
 * FORM SETTINGS PANEL - Select and configure embedded forms
 * ============================================================================
 *
 * Settings panel for the Form element in the Website Builder.
 * Allows users to select a published form from their Form Builder forms.
 *
 * FEATURES:
 * - Dropdown to select from published forms
 * - Shows form name and status
 * - Updates element with selected form ID, name, and slug
 *
 * IMPORTANT:
 * - Only PUBLISHED forms are shown (forms that are ready to be displayed)
 * - Forms are fetched from the organization's forms list
 * - Uses Redux dispatch directly (like SmartCmsListSettingsSection)
 */

'use client'

import { FileText, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'
import { useAppDispatch, useAppSelector, updateElement, selectPageInfos } from '../../_lib'
import type { FormElement } from '../../_lib/types'
import { PropertySection, InputGroupControl, ToggleControl } from './controls'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

// ============================================================================
// TYPES
// ============================================================================

interface FormSettingsPanelProps {
  /** The form element being configured */
  element: FormElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Form settings panel for selecting which form to embed.
 *
 * USAGE:
 * ```tsx
 * <FormSettingsPanel element={selectedFormElement} />
 * ```
 */
export function FormSettingsPanel({
  element,
}: FormSettingsPanelProps) {
  // ========================================================================
  // REDUX & CONTEXT
  // ========================================================================

  const dispatch = useAppDispatch()
  const builderContext = useBuilderContextSafe()
  const organizationId = builderContext?.organizationId

  /** All pages in this website - used for the redirect page selector */
  const allPages = useAppSelector(selectPageInfos)

  /** Derived redirect state with defaults */
  const redirectEnabled = element.successRedirectEnabled ?? false
  const redirectType = element.successRedirectType ?? 'page'

  /**
   * Generic property updater for FormElement.
   * Same pattern as checkout-settings.tsx.
   */
  const updateProperty = <K extends keyof FormElement>(
    key: K,
    value: FormElement[K]
  ) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { [key]: value },
      })
    )
  }

  // ========================================================================
  // DATA FETCHING - Fetch published forms for selection
  // ========================================================================

  /**
   * Fetch all published forms from the organization.
   * Only published forms can be embedded in websites.
   */
  const { data: formsData, isLoading: isFormsLoading, error: formsError } = trpc.forms.list.useQuery(
    {
      organizationId: organizationId ?? '',
      status: 'PUBLISHED',
      pageSize: 100, // Fetch up to 100 forms
    },
    {
      enabled: Boolean(organizationId),
    }
  )

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /**
   * Handle form selection from dropdown.
   * Updates formId, formName, and formSlug on the element using Redux dispatch.
   */
  const handleFormSelect = (formId: string) => {
    // Find the selected form to get its details
    const selectedForm = formsData?.forms.find((f: { id: string; name: string; slug: string }) => f.id === formId)

    if (selectedForm) {
      // Update all form-related properties at once using Redux
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            formId: selectedForm.id,
            formName: selectedForm.name,
            formSlug: selectedForm.slug,
          },
        })
      )
    } else if (formId === 'none') {
      // Clear form selection
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            formId: '',
            formName: '',
            formSlug: '',
          },
        })
      )
    }
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  // No organization context available
  if (!organizationId) {
    return (
      <PropertySection title="Form Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Organization context not available</span>
        </div>
      </PropertySection>
    )
  }

  // Loading forms
  if (isFormsLoading) {
    return (
      <PropertySection title="Form Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading forms...</span>
        </div>
      </PropertySection>
    )
  }

  // Error loading forms
  if (formsError) {
    return (
      <PropertySection title="Form Settings" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load forms</span>
        </div>
      </PropertySection>
    )
  }

  // No published forms available
  const publishedForms = formsData?.forms || []

  return (
    <>
    <PropertySection title="Form Settings" defaultOpen>
      {/* Form Selection Dropdown */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Select Form</label>
        <Select
          value={element.formId || 'none'}
          onValueChange={handleFormSelect}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a form...">
              {element.formId ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate">
                    {element.formName || 'Selected form'}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select a form...</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* Option to clear selection */}
            <SelectItem value="none">
              <span className="text-muted-foreground">No form selected</span>
            </SelectItem>

            {/* List of published forms */}
            {publishedForms.length > 0 ? (
              publishedForms.map((form) => (
                <SelectItem key={form.id} value={form.id}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>{form.name}</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No published forms available.
                <br />
                Create and publish a form first.
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Selected form info */}
      {element.formId && element.formName && (
        <div className="mt-3 p-2 rounded-md bg-muted/50 border border-border">
          <div className="text-xs text-muted-foreground mb-1">Connected Form</div>
          <div className="text-sm font-medium">{element.formName}</div>
          {element.formSlug && (
            <div className="text-xs text-muted-foreground mt-1">
              Slug: {element.formSlug}
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-muted-foreground mt-3">
        Only published forms are available for embedding.
        Forms must be published in the Form Builder before they can be used here.
      </p>
    </PropertySection>

    {/* ================================================================
     * AFTER SUBMISSION SECTION
     * ================================================================
     * Controls what happens after a successful form submission.
     * Default: show inline success message (from form schema).
     * Optional: redirect to a page in this website or a custom URL.
     * This overrides the form schema's own redirectUrl when enabled.
     * Same pattern as checkout-settings.tsx "After Payment" section.
     * ================================================================ */}
    <PropertySection title="After Submission" defaultOpen>
      {/* Redirect Toggle */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <ExternalLink className={`h-4 w-4 ${redirectEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          <Label htmlFor="form-redirect-toggle" className="text-sm font-medium cursor-pointer">
            Redirect after submission
          </Label>
        </div>
        <Switch
          id="form-redirect-toggle"
          checked={redirectEnabled}
          onCheckedChange={(checked: boolean) => updateProperty('successRedirectEnabled', checked)}
        />
      </div>

      {/* Redirect description when disabled */}
      {!redirectEnabled && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md mx-3">
          Shows a success message after submission. Enable to redirect users to a page or URL instead.
        </div>
      )}

      {/* Redirect Options - shown when toggle is ON */}
      {redirectEnabled && (
        <div className="space-y-3 px-3 pt-1">
          {/* Destination Type Selector - tab-style buttons */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            <button
              type="button"
              onClick={() => updateProperty('successRedirectType', 'page')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                redirectType === 'page'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Website Page
            </button>
            <button
              type="button"
              onClick={() => updateProperty('successRedirectType', 'url')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                redirectType === 'url'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Custom URL
            </button>
          </div>

          {/* Page Selector - shown when redirectType is 'page' */}
          {redirectType === 'page' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Select Page</label>
              {allPages.length > 0 ? (
                <Select
                  value={element.successRedirectPageSlug ?? '__none__'}
                  onValueChange={(val) => updateProperty('successRedirectPageSlug', val === '__none__' ? undefined : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a page...">
                      {element.successRedirectPageSlug ? (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="truncate">
                            {allPages.find((p) => p.slug === element.successRedirectPageSlug)?.name ?? element.successRedirectPageSlug}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select a page...</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">Select a page...</span>
                    </SelectItem>
                    {allPages.map((page) => (
                      <SelectItem key={page.id} value={page.slug}>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <span>{page.name}</span>
                          <span className="text-muted-foreground text-xs">{page.slug}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="py-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3">
                  No pages found. Add pages to your website first.
                </div>
              )}
            </div>
          )}

          {/* Custom URL Input - shown when redirectType is 'url' */}
          {redirectType === 'url' && (
            <div className="space-y-3">
              <InputGroupControl
                label="URL"
                value={element.successRedirectUrl ?? ''}
                onChange={(val) => updateProperty('successRedirectUrl', String(val))}
                type="text"
              />
              <ToggleControl
                label="Open in New Tab"
                checked={element.successRedirectNewTab ?? false}
                onChange={(checked) => updateProperty('successRedirectNewTab', checked)}
              />
            </div>
          )}
        </div>
      )}
    </PropertySection>
  </>
  )
}
