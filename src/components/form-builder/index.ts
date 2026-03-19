/**
 * ============================================================================
 * FORM BUILDER - Public Exports
 * ============================================================================
 *
 * This is the main entry point for the form builder module.
 * Import from '@/components/form-builder' for clean imports.
 *
 * USAGE:
 *
 * // Main form builder (standalone page)
 * import { FormBuilder } from '@/components/form-builder'
 * <FormBuilder organizationId="..." formSlug="..." onSave={...} />
 *
 * // Modal form builder (open from anywhere)
 * import { FormBuilderModal } from '@/components/form-builder'
 * <FormBuilderModal open={...} onOpenChange={...} ... />
 *
 * // Types
 * import type { FormSchema, FormElement } from '@/components/form-builder'
 */

// ============================================================================
// MAIN COMPONENTS
// ============================================================================

export { FormBuilder } from './form-builder'
export { FormBuilderModal } from './form-builder-modal'

// ============================================================================
// FORM RENDERER (Portable, standalone form rendering)
// ============================================================================

/**
 * FormRenderer is the SINGLE SOURCE OF TRUTH for rendering forms.
 * Use this component everywhere forms need to be displayed:
 * - Form builder preview mode
 * - Public form page (/f/[slug])
 * - Website builder embedded forms
 * - External iframe embeds (Webflow, etc.)
 */
export { FormRenderer } from './form-renderer'
export type { FormRendererProps } from './form-renderer'

// ============================================================================
// TYPES
// ============================================================================

export type {
  FormSchema,
  FormElement,
  FormElementType,
  FormStyles,
  FormSettings,
  ElementStyles,
  ValidationRule,
  ValidationRuleType,
  LogicRule,
  LogicOperator,
  SelectOption,
  FormBuilderProps,
  FormBuilderModalProps,
  FormBuilderState,
  BuilderSelection,
  DragState,
  HistoryEntry,
  FormStatus,
} from './_lib/types'

// ============================================================================
// DEFAULTS
// ============================================================================

export {
  DEFAULT_FORM_SCHEMA,
  DEFAULT_FORM_STYLES,
  DEFAULT_FORM_SETTINGS,
} from './_lib/types'

// ============================================================================
// CONTEXT (for advanced usage)
// ============================================================================

export {
  FormBuilderProvider,
  useFormBuilder,
  createFormElement,
} from './_lib/form-builder-context'

// ============================================================================
// ELEMENT REGISTRY (for extending)
// ============================================================================

export {
  ELEMENT_REGISTRY,
  ELEMENT_CATEGORIES,
  getElementEntry,
  getElementsByCategory,
  getGroupedElements,
  isInputElement,
  isLayoutElement,
  getElementIcon,
} from './_lib/element-registry'

export type {
  ElementRegistryEntry,
  ElementCategory,
  CategoryMeta,
} from './_lib/element-registry'
