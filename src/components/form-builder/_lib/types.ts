/**
 * ============================================================================
 * FORM BUILDER TYPES
 * ============================================================================
 *
 * Type definitions for the form builder system.
 * These types define the structure of forms, elements, styles, and validation.
 *
 * ARCHITECTURE:
 * - FormSchema: Root schema containing all form data
 * - FormElement: Individual form elements (inputs, selects, etc.)
 * - FormStyles: Global form styles that stay with the form when embedded
 * - ElementStyles: Per-element style overrides
 * - ValidationRule: Validation rules for form elements
 * - LogicRule: Conditional show/hide rules between elements
 *
 * PORTABILITY:
 * All styles are designed to be inline/embedded so they work when the form
 * is embedded via iframe on external sites (Webflow, etc.)
 */

// ============================================================================
// ELEMENT TYPES
// ============================================================================

/**
 * All available form element types.
 * Each type has specific properties and rendering behavior.
 */
export type FormElementType =
  // Input elements
  | 'text'           // Single-line text input
  | 'firstName'      // First name input (maps to Lead.firstName)
  | 'lastName'       // Last name input (maps to Lead.lastName)
  | 'email'          // Email input with validation
  | 'phone'          // Phone number input
  | 'number'         // Numeric input
  | 'password'       // Password input
  | 'url'            // URL input with validation
  | 'textarea'       // Multi-line text input
  // Address elements (with browser autofill support)
  | 'address'        // Street address line 1
  | 'address2'       // Street address line 2 (apt, suite, etc.)
  | 'city'           // City/Town
  | 'state'          // State/Province/Region
  | 'zipCode'        // ZIP/Postal code
  | 'country'        // Country
  // Selection elements
  | 'select'         // Dropdown select
  | 'multiselect'    // Multi-select dropdown
  | 'radio'          // Radio button group
  | 'checkbox'       // Single checkbox
  | 'checkboxGroup'  // Multiple checkboxes
  // Date/Time elements
  | 'date'           // Date picker
  | 'time'           // Time picker
  | 'datetime'       // Date and time picker
  // File elements
  | 'file'           // File upload
  | 'image'          // Image upload with preview
  // Layout elements
  | 'heading'        // Section heading (h1-h6)
  | 'paragraph'      // Descriptive text
  | 'divider'        // Visual separator
  | 'spacer'         // Empty space
  // Special elements
  | 'hidden'         // Hidden field
  | 'rating'         // Star rating
  | 'slider'         // Range slider
  | 'signature'      // Signature pad
  | 'submit'         // Submit button

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Validation rule types.
 * Each rule type has specific parameters and error messages.
 */
export type ValidationRuleType =
  | 'required'       // Field must have a value
  | 'minLength'      // Minimum character length
  | 'maxLength'      // Maximum character length
  | 'min'            // Minimum numeric value
  | 'max'            // Maximum numeric value
  | 'pattern'        // Regex pattern match
  | 'email'          // Valid email format
  | 'url'            // Valid URL format
  | 'phone'          // Valid phone format
  | 'custom'         // Custom validation function

/**
 * Single validation rule definition.
 */
export interface ValidationRule {
  type: ValidationRuleType
  /** Value for the rule (e.g., minLength: 5) */
  value?: string | number | boolean
  /** Custom error message */
  message?: string
  /** Whether this rule is enabled */
  enabled: boolean
}

// ============================================================================
// LOGIC/CONDITIONAL TYPES
// ============================================================================

/**
 * Logic rule operators for conditional visibility.
 */
export type LogicOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'isEmpty'
  | 'isNotEmpty'

/**
 * Logic rule for conditional show/hide.
 * When all conditions are met, the element is shown/hidden based on action.
 */
export interface LogicRule {
  id: string
  /** Element ID that triggers this rule */
  sourceElementId: string
  /** Comparison operator */
  operator: LogicOperator
  /** Value to compare against */
  value: string | number | boolean
  /** Action to take when condition is met */
  action: 'show' | 'hide'
}

// ============================================================================
// SELECT OPTION TYPE
// ============================================================================

/**
 * Option for select, radio, and checkbox elements.
 */
export interface SelectOption {
  id: string
  label: string
  value: string
  /** Whether this option is selected by default */
  isDefault?: boolean
}

// ============================================================================
// ELEMENT STYLES
// ============================================================================

/**
 * Per-element style overrides.
 * These override the global form styles for specific elements.
 * All values support CSS units (px, rem, %, etc.)
 */
export interface ElementStyles {
  // Container
  width?: string
  marginTop?: string
  marginBottom?: string

  // Label
  labelColor?: string
  labelFontSize?: string
  labelFontWeight?: string
  hideLabel?: boolean

  // Input
  inputBackgroundColor?: string
  inputBorderColor?: string
  inputBorderWidth?: string
  inputBorderRadius?: string
  inputPadding?: string
  inputFontSize?: string
  inputTextColor?: string
  inputPlaceholderColor?: string
  inputFocusBorderColor?: string
  inputHeight?: string

  // For text elements (heading, paragraph)
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
}

// ============================================================================
// FORM ELEMENT
// ============================================================================

/**
 * Complete form element definition.
 * Each element has a unique ID and type-specific properties.
 */
export interface FormElement {
  /** Unique element ID */
  id: string
  /** Element type */
  type: FormElementType

  // Basic properties (for input elements)
  /** Field name (used in form data) */
  name: string
  /** Display label */
  label: string
  /** Placeholder text */
  placeholder?: string
  /** Help text shown below input */
  helpText?: string
  /** Default value */
  defaultValue?: string | number | boolean | string[]

  // Validation
  /** Whether field is required */
  required: boolean
  /** Validation rules */
  validation: ValidationRule[]

  // Conditional logic
  /** Logic rules for show/hide */
  logicRules: LogicRule[]

  // Options (for select, radio, checkbox elements)
  options?: SelectOption[]

  /**
   * Reference to a custom dataset field.
   * When set, submission data for this element goes to CustomDataResponse
   * instead of the Lead model.
   *
   * IDs are used for database operations (never change).
   * Variable access is flat: {{lead.customData.fieldSlug}}
   */
  datasetFieldRef?: {
    /** CustomDataCategory.id - the dataset this field belongs to */
    datasetId: string
    /** CustomDataField.id - the specific field */
    fieldId: string
    /** CustomDataField.slug - used as key in customData for variable access */
    fieldSlug: string
  }

  // Element-specific properties
  props: {
    // Text input props
    inputType?: 'text' | 'email' | 'tel' | 'number' | 'password' | 'url'
    autocomplete?: string

    // Textarea props
    rows?: number
    resize?: 'none' | 'vertical' | 'horizontal' | 'both'

    // Number props
    min?: number
    max?: number
    step?: number

    // File props
    accept?: string
    maxSize?: number // in bytes
    multiple?: boolean

    // Heading props
    headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

    // Spacer props
    height?: string

    // Rating props
    maxRating?: number

    // Slider props
    sliderMin?: number
    sliderMax?: number
    sliderStep?: number
    showValue?: boolean

    // Submit button props
    buttonText?: string
    buttonVariant?: 'default' | 'outline' | 'ghost'
    buttonFullWidth?: boolean

    // Any additional custom props
    [key: string]: unknown
  }

  // Styling
  styles: ElementStyles
}

// ============================================================================
// GLOBAL FORM STYLES
// ============================================================================

/**
 * Global form styles that apply to all elements.
 * These are portable - they stay with the form when embedded via iframe.
 */
export interface FormStyles {
  // Canvas/Page background (the area behind the form)
  canvasColor: string

  // Form container
  backgroundColor: string
  padding: string
  borderRadius: string
  maxWidth: string
  fontFamily: string

  // Label styles (default for all labels)
  labelColor: string
  labelFontSize: string
  labelFontWeight: string
  labelMarginBottom: string

  // Input styles (default for all inputs)
  inputBackgroundColor: string
  inputBorderColor: string
  inputBorderWidth: string
  inputBorderRadius: string
  inputPadding: string
  inputFontSize: string
  inputTextColor: string
  inputPlaceholderColor: string
  inputFocusBorderColor: string
  inputFocusRingColor: string
  inputFocusRingWidth: string

  // Button styles (submit button)
  buttonBackgroundColor: string
  buttonTextColor: string
  buttonBorderRadius: string
  buttonPadding: string
  buttonFontSize: string
  buttonFontWeight: string
  buttonHoverBackgroundColor: string

  // Spacing
  elementSpacing: string

  // Error styles
  errorColor: string
  errorFontSize: string

  // Help text styles
  helpTextColor: string
  helpTextFontSize: string
}

// ============================================================================
// FORM SETTINGS
// ============================================================================

/**
 * Form-level settings.
 */
export interface FormSettings {
  /** Submit button text */
  submitButtonText: string
  /** Success message after submission */
  successMessage: string
  /** Redirect URL after submission (optional) */
  redirectUrl?: string
  /** Email addresses to notify on submission */
  notifyEmails: string[]
  /** Whether to show CAPTCHA */
  enableCaptcha: boolean
  /** Maximum number of submissions (null = unlimited) */
  submissionLimit?: number
  /** Whether to show progress indicator */
  showProgress: boolean
  /** Whether to allow saving draft */
  allowDraft: boolean
}

// ============================================================================
// FORM SCHEMA (ROOT)
// ============================================================================

/**
 * Complete form schema.
 * This is the root object stored in the form's config JSON field.
 */
export interface FormSchema {
  /** Schema version for migrations */
  version: number
  /** Form title/name - editable in the builder header */
  title: string
  /** Form elements in order */
  elements: FormElement[]
  /** Global form styles */
  styles: FormStyles
  /** Form settings */
  settings: FormSettings
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default form styles.
 * Clean, modern design that works on any website.
 */
export const DEFAULT_FORM_STYLES: FormStyles = {
  // Canvas/Page background
  canvasColor: '#f5f5f5',

  // Container
  backgroundColor: '#ffffff',
  padding: '32px',
  borderRadius: '12px',
  maxWidth: '600px',
  fontFamily: 'Inter, system-ui, sans-serif',

  // Labels
  labelColor: '#1a1a1a',
  labelFontSize: '14px',
  labelFontWeight: '500',
  labelMarginBottom: '6px',

  // Inputs
  inputBackgroundColor: '#ffffff',
  inputBorderColor: '#e5e5e5',
  inputBorderWidth: '1px',
  inputBorderRadius: '8px',
  inputPadding: '12px 14px',
  inputFontSize: '15px',
  inputTextColor: '#1a1a1a',
  inputPlaceholderColor: '#a3a3a3',
  inputFocusBorderColor: '#3b82f6',
  inputFocusRingColor: 'rgba(59, 130, 246, 0.1)',
  inputFocusRingWidth: '3px',

  // Button
  buttonBackgroundColor: '#1a1a1a',
  buttonTextColor: '#ffffff',
  buttonBorderRadius: '8px',
  buttonPadding: '12px 24px',
  buttonFontSize: '15px',
  buttonFontWeight: '500',
  buttonHoverBackgroundColor: '#333333',

  // Spacing
  elementSpacing: '24px',

  // Error
  errorColor: '#ef4444',
  errorFontSize: '13px',

  // Help text
  helpTextColor: '#737373',
  helpTextFontSize: '13px',
}

/**
 * Default form settings.
 */
export const DEFAULT_FORM_SETTINGS: FormSettings = {
  submitButtonText: 'Submit',
  successMessage: 'Thank you! Your submission has been received.',
  redirectUrl: undefined,
  notifyEmails: [],
  enableCaptcha: false,
  submissionLimit: undefined,
  showProgress: false,
  allowDraft: false,
}

/**
 * Default empty form schema.
 */
export const DEFAULT_FORM_SCHEMA: FormSchema = {
  version: 1,
  title: 'Untitled Form',
  elements: [],
  styles: DEFAULT_FORM_STYLES,
  settings: DEFAULT_FORM_SETTINGS,
}

// ============================================================================
// BUILDER STATE TYPES
// ============================================================================

/**
 * Selection state in the builder.
 */
export interface BuilderSelection {
  /** Currently selected element ID */
  selectedElementId: string | null
  /** Multiple selected element IDs (for bulk operations) */
  selectedElementIds: string[]
}

/**
 * Drag state for DnD operations.
 */
export interface DragState {
  /** Whether dragging is active */
  isDragging: boolean
  /** Type of element being dragged */
  draggedType: FormElementType | null
  /** ID of element being dragged (for reorder) */
  draggedElementId: string | null
  /** Index where element will be dropped */
  dropIndex: number | null
}

/**
 * Undo/redo history entry.
 */
export interface HistoryEntry {
  /** Snapshot of form schema */
  schema: FormSchema
  /** Timestamp */
  timestamp: number
  /** Description of change */
  description: string
}

/**
 * Viewport mode for responsive preview.
 * Desktop shows the full-width form, mobile simulates a narrow screen.
 */
export type ViewportMode = 'desktop' | 'mobile'

/**
 * Complete builder state.
 */
export interface FormBuilderState {
  /** Current form schema */
  schema: FormSchema
  /** Selection state */
  selection: BuilderSelection
  /** Drag state */
  drag: DragState
  /** Undo history */
  history: HistoryEntry[]
  /** Current history index */
  historyIndex: number
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Active sidebar tab */
  activeSidebarTab: 'elements' | 'styles' | 'settings'
  /** Active properties tab */
  activePropertiesTab: 'properties' | 'styles' | 'logic'
  /** Preview mode */
  isPreviewMode: boolean
  /** Viewport mode for responsive preview (desktop/mobile) */
  viewportMode: ViewportMode
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean
}

// ============================================================================
// FORM STATUS TYPE
// ============================================================================

/**
 * Form publication status.
 * Mirrors the Prisma FormStatus enum for type safety without importing Prisma types.
 */
export type FormStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * Props for the main FormBuilder component.
 */
export interface FormBuilderProps {
  /** Organization ID */
  organizationId: string
  /** Form ID (for loading existing form) */
  formId?: string
  /** Form slug (for loading by slug) */
  formSlug?: string
  /** Initial form schema (for new forms or preloaded data) */
  initialSchema?: FormSchema
  /** Current form status (DRAFT, PUBLISHED, etc.) */
  formStatus?: FormStatus
  /** Callback when form is saved */
  onSave?: (schema: FormSchema) => void | Promise<void>
  /** Callback when form publish status changes */
  onPublish?: (status: FormStatus) => void | Promise<void>
  /** Callback when form slug is updated - returns new slug for URL update */
  onSlugChange?: (newSlug: string) => void | Promise<void>
  /** Callback when builder is closed */
  onClose?: () => void
  /** Callback when dirty state changes (for modal to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void
  /** Whether this is in a modal */
  isModal?: boolean
  /** Custom class name */
  className?: string
}

/**
 * Props for the FormBuilderModal component.
 */
export interface FormBuilderModalProps extends Omit<FormBuilderProps, 'isModal' | 'onClose'> {
  /** Whether the modal is open */
  open: boolean
  /** Callback when modal closes */
  onOpenChange: (open: boolean) => void
}
