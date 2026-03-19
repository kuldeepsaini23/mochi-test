/**
 * ============================================================================
 * UNIFIED FORM ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedForm, unified-form, form-element-unified
 *
 * This component replaces BOTH:
 *   - elements/form-element.tsx (canvas editor)
 *   - renderers/element-renderers/form-element-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY -- the form body (or placeholder states).
 * In canvas mode, the parent `ElementWrapper` handles all editor chrome:
 *   - Selection ring, hover ring, resize handles, labels, dimensions pill
 *   - Pointer events (drag, hover enter/leave)
 *
 * In preview mode, this component wraps content in a positioned container
 * using `computeElementPositionStyles()` and `useElementSizeStyles()`.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - tRPC form fetch via forms.getById
 *   - Placeholder states: no form selected, loading, form not found
 *   - Gradient border support via useGradientBorder + GradientBorderOverlay
 *   - Background color and border radius from element.styles
 *
 * CANVAS MODE (mode='canvas'):
 *   - organizationId from useBuilderContextSafe()
 *   - FormRenderer with disabled={true} (no user interaction in editor)
 *   - pointerEvents: 'none' on selected form to allow drag-through
 *   - Content rendered directly -- ElementWrapper handles chrome
 *
 * PREVIEW MODE (mode='preview'):
 *   - organizationId from RenderModeContext OR useBuilderContextSafe()
 *   - FormRenderer with disabled={false} (forms are INTERACTIVE!)
 *   - Passes success redirect props to FormRenderer for post-submit navigation
 *   - Self-wrapped in positioned container for page layout
 *
 * ============================================================================
 * WHY FORMS USE AUTO HEIGHT
 * ============================================================================
 *
 * Forms should ALWAYS use autoHeight because:
 *   1. Form content (elements) can change after the form is placed
 *   2. Fixed height causes content to be cut off
 *   3. Users should not have to manually resize forms when content changes
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { FileText } from 'lucide-react'
import type { FormElement as FormElementType, BorderConfig, Breakpoint } from '../../_lib/types'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { useRenderMode } from '../../_lib/render-mode-context'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { FormRenderer } from '@/components/form-builder/form-renderer'
import { trpc } from '@/trpc/react-provider'
import { useBuilderContextSafe } from '../../_lib/builder-context'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum height for form placeholder states.
 * Ensures the form element has visible dimensions when no form is selected,
 * when loading, or when the form is not found.
 * SOURCE OF TRUTH: FORM_PLACEHOLDER_MIN_HEIGHT
 */
const PLACEHOLDER_MIN_HEIGHT = 200

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedForm component.
 *
 * SOURCE OF TRUTH: UnifiedFormProps
 *
 * In canvas mode, this component is rendered INSIDE an ElementWrapper which
 * provides all editor chrome. The only prop needed is the element data.
 * In preview mode, the component handles its own positioned wrapper.
 */
interface UnifiedFormProps {
  /** The form element data -- SOURCE OF TRUTH: FormElement from types.ts */
  element: FormElementType
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified form element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode -- the ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode -- includes positioned container.
 *
 * Uses tRPC forms.getById to fetch the form schema and FormRenderer
 * to display the actual form fields.
 */
export function UnifiedForm({ element }: UnifiedFormProps) {
  const { mode, breakpoint, organizationId: contextOrgId } = useRenderMode()
  const isPreview = mode === 'preview'

  /**
   * Determine the active breakpoint for responsive style resolution.
   * Canvas mode always uses 'desktop' because the builder handles breakpoint
   * switching at a higher level. Preview mode uses the context breakpoint.
   */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // ORGANIZATION ID RESOLUTION
  // ==========================================================================

  /**
   * Resolve organizationId for form data fetching.
   * - Canvas mode: from BuilderContext (always available in editor)
   * - Preview mode: from RenderModeContext (passed by page renderer) OR
   *   BuilderContext (builder preview panel)
   */
  const builderContext = useBuilderContextSafe()
  const organizationId = contextOrgId || builderContext?.organizationId

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  /**
   * Fetch form data when a formId is set.
   * Uses the existing getById tRPC endpoint.
   * Enabled only when both organizationId and formId are available.
   */
  const { data: formData, isLoading: isFormLoading } = trpc.forms.getById.useQuery(
    {
      organizationId: organizationId ?? '',
      formId: element.formId,
    },
    {
      enabled: Boolean(organizationId && element.formId),
    }
  )

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  /**
   * Extract border configuration for gradient border rendering.
   * The __borderConfig is stored as a private property on element.styles.
   * When a gradient border is active, a CSS ::before pseudo-element overlay is injected.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // AUTO HEIGHT RESOLUTION
  // ==========================================================================

  /**
   * Forms should ALWAYS use autoHeight to prevent content cutoff.
   * We default to true if not explicitly set on the element.
   */
  const hasAutoHeight = element.autoHeight !== false

  // ==========================================================================
  // CONTENT STYLE COMPUTATION
  // ==========================================================================

  /**
   * Content styles for the form container.
   * Shared between canvas and preview modes -- the visual appearance
   * of the form wrapper is identical in both.
   */
  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    minHeight: hasAutoHeight ? 'fit-content' : '100%',
    backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
    borderRadius: element.styles?.borderRadius as number ?? 8,
    overflow: 'hidden',
  }

  // ==========================================================================
  // FORM CONTENT RENDERER (shared between all modes)
  // ==========================================================================

  /**
   * Renders the form content based on the current state of form data.
   *
   * PLACEHOLDER STATES:
   * Uses explicit minHeight instead of absolute positioning to prevent the
   * element from collapsing when autoHeight is enabled (no intrinsic content).
   *
   * @param disabled - Whether the form inputs should be disabled (true in canvas)
   */
  const renderFormContent = (disabled: boolean) => {
    // No form selected - show placeholder with instructions
    if (!element.formId) {
      return (
        <div
          style={{
            width: '100%',
            minHeight: hasAutoHeight ? PLACEHOLDER_MIN_HEIGHT : '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            padding: '24px',
          }}
        >
          <FileText className="w-12 h-12 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground/60">
            {isPreview ? 'Form not configured' : 'Select a form'}
          </p>
          {!isPreview && (
            <p className="text-xs text-muted-foreground/40 mt-1">Go to Settings tab</p>
          )}
        </div>
      )
    }

    // Form loading - show spinner with explicit height
    if (isFormLoading) {
      return (
        <div
          style={{
            width: '100%',
            minHeight: hasAutoHeight ? PLACEHOLDER_MIN_HEIGHT : '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            padding: '24px',
          }}
        >
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground/60 mt-2">Loading form...</p>
        </div>
      )
    }

    // Extract config to avoid deep type instantiation issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formConfig = (formData as any)?.config

    // Form not found or no config - show error with explicit height
    if (!formConfig) {
      return (
        <div
          style={{
            width: '100%',
            minHeight: hasAutoHeight ? PLACEHOLDER_MIN_HEIGHT : '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            padding: '24px',
          }}
        >
          <FileText className="w-12 h-12 text-destructive/40 mb-2" />
          <p className="text-sm text-destructive/60">Form not found</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            {element.formName || element.formId}
          </p>
        </div>
      )
    }

    /**
     * Render the actual form using FormRenderer.
     *
     * CANVAS MODE: disabled={true} -- prevents form interaction so dragging works
     * PREVIEW MODE: disabled={false} -- forms are fully interactive for end users
     *
     * In preview mode, pass success redirect props so FormRenderer knows where
     * to navigate after a successful submission.
     */
    if (disabled) {
      // Canvas mode: wrap in a div with no pointer events when selected
      return (
        <div style={{ pointerEvents: 'auto' }}>
          <FormRenderer
            schema={formConfig as Parameters<typeof FormRenderer>[0]['schema']}
            disabled={true}
            showCanvas={false}
          />
        </div>
      )
    }

    // Preview mode: fully interactive form with redirect support
    return (
      <FormRenderer
        formId={element.formId}
        schema={formConfig as unknown as Parameters<typeof FormRenderer>[0]['schema']}
        disabled={false}
        showCanvas={false}
        successRedirectEnabled={element.successRedirectEnabled}
        successRedirectType={element.successRedirectType}
        successRedirectPageSlug={element.successRedirectPageSlug}
        successRedirectUrl={element.successRedirectUrl}
        successRedirectNewTab={element.successRedirectNewTab}
      />
    )
  }

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return (
      <div className={gradientBorder.className || undefined} style={contentStyle}>
        {/* Gradient border overlay -- injects CSS for ::before pseudo-element */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}
        {renderFormContent(true)}
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE -- Positioned wrapper
  // ==========================================================================

  /**
   * In preview mode, the form needs its own positioned wrapper for layout.
   * Each element renderer is responsible for its own position/size in the page.
   * The page-renderer does NOT provide a positioned container.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: true, // Forms default to auto height
  })

  /**
   * Preview container styles -- combines position, size, and form-specific styles.
   * autoHeight: 'visible' overflow to let form content flow naturally.
   */
  const containerStyle: React.CSSProperties = {
    ...positionStyles,
    ...sizeStyles,
    backgroundColor: element.styles?.backgroundColor as string ?? 'transparent',
    borderRadius: element.styles?.borderRadius as number ?? 8,
    overflow: hasAutoHeight ? 'visible' : 'hidden',
  }

  return (
    <div data-form-element-id={element.id} style={containerStyle}>
      {renderFormContent(false)}
    </div>
  )
}
