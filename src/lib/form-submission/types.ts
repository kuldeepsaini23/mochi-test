/**
 * Form Submission Types
 *
 * Types for processing form submissions and mapping form fields
 * to Lead model fields and CustomDataResponse.
 *
 * All types are derived from Prisma schema or existing service types
 * to prevent drift and ensure type safety.
 */

import type { Lead, FormStatus } from '@/generated/prisma'
import type { FormElement, FormElementType, FormSchema } from '@/components/form-builder/_lib/types'
import type { LeadCreateInput, LeadUpdateInput } from '@/services/leads.service'

// ============================================================================
// STANDARD LEAD FIELDS - Derived from LeadCreateInput
// ============================================================================

/**
 * Extract the keys from LeadCreateInput that represent actual lead data fields.
 * Excludes organizationId which is a context field, not a data field.
 */
type LeadDataFields = Omit<LeadCreateInput, 'organizationId'>

/**
 * Keys of lead fields that can be populated from form submissions.
 * Derived from LeadCreateInput to stay in sync with the Lead model.
 */
export type StandardLeadField = keyof LeadDataFields

/**
 * Array of standard lead fields for iteration/validation.
 * Must match the keys in LeadCreateInput (minus organizationId).
 */
export const STANDARD_LEAD_FIELDS: readonly StandardLeadField[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'address2',
  'city',
  'state',
  'zipCode',
  'country',
  'source',
  'location',
  'locationCode',
  'status',
  'assignedToId',
] as const

// ============================================================================
// FIELD MAPPING
// ============================================================================

/**
 * Target for lead field mapping - stores data in the Lead model.
 */
export interface LeadFieldTarget {
  type: 'lead'
  field: StandardLeadField
}

/**
 * Target for custom data mapping - stores data in CustomDataResponse.
 */
export interface CustomDataTarget {
  type: 'customData'
  datasetId: string
  fieldId: string
  fieldSlug: string
}

/**
 * Target for submission-only storage - no lead mapping.
 */
export interface SubmissionOnlyTarget {
  type: 'submission'
}

/**
 * Where a form field's data should be stored.
 *
 * - lead: Maps to a standard Lead model field
 * - customData: Maps to a CustomDataResponse (via datasetFieldRef)
 * - submission: Only stored in FormSubmission.data (no lead mapping)
 */
export type FieldMappingTarget = LeadFieldTarget | CustomDataTarget | SubmissionOnlyTarget

/**
 * Auto-detection mapping from form element types to Lead fields.
 * Elements with these types automatically map to the corresponding Lead field.
 */
export const ELEMENT_TYPE_TO_LEAD_FIELD: Partial<Record<FormElementType, StandardLeadField>> = {
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  address: 'address',
  address2: 'address2',
  city: 'city',
  state: 'state',
  zipCode: 'zipCode',
  country: 'country',
} as const

// ============================================================================
// FORM DATA TYPES - Properly typed submission data
// ============================================================================

/**
 * Primitive values that can be submitted in a form field.
 */
export type FormFieldValue = string | number | boolean | null

/**
 * Array of primitive values (for multiselect, checkboxGroup, etc.)
 */
export type FormFieldArrayValue = string[] | number[]

/**
 * All possible form field values.
 */
export type FormSubmissionValue = FormFieldValue | FormFieldArrayValue

/**
 * Form submission data - a record of field names to their values.
 * Properly typed to avoid `unknown`.
 */
export type FormSubmissionData = Record<string, FormSubmissionValue>

// ============================================================================
// SUBMISSION INPUT/OUTPUT
// ============================================================================

/**
 * Metadata collected during form submission.
 */
export interface SubmissionMetadata {
  ipAddress?: string
  userAgent?: string
  referrerUrl?: string
}

/**
 * Input for processing a form submission.
 */
export interface FormSubmissionInput {
  /** Form ID to submit to */
  formId: string
  /** Submitted form data keyed by element name */
  data: FormSubmissionData
  /** Optional metadata about the submission */
  metadata?: SubmissionMetadata
}

/**
 * Successful submission result.
 */
export interface FormSubmissionSuccess {
  success: true
  submissionId: string
  leadId: string | null
  isNewLead: boolean
}

/**
 * Failed submission result.
 */
export interface FormSubmissionFailure {
  success: false
  error: string
  code: 'FORM_NOT_FOUND' | 'FORM_NOT_PUBLISHED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'
}

/**
 * Result of processing a form submission.
 */
export type FormSubmissionResult = FormSubmissionSuccess | FormSubmissionFailure

// ============================================================================
// INTERNAL PROCESSING TYPES
// ============================================================================

/**
 * Parsed form with typed config for submission processing.
 */
export interface ParsedForm {
  id: string
  name: string
  status: FormStatus
  organizationId: string
  config: FormSchema
}

/**
 * Data extracted and categorized from a form submission.
 */
export interface CategorizedSubmissionData {
  /** Data to be saved to Lead model fields */
  leadData: Partial<LeadUpdateInput>
  /** Data to be saved to CustomDataResponse, grouped by datasetId */
  customData: Map<string, Record<string, FormSubmissionValue>>
  /** The email extracted from submission (required for lead matching) */
  email: string | null
}

/**
 * Result of lead upsert operation.
 */
export interface LeadUpsertResult {
  lead: Lead
  isNew: boolean
}

// ============================================================================
// FIELD DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect the mapping target for a form element.
 *
 * Priority:
 * 1. If element has datasetFieldRef → customData target
 * 2. If element type maps to lead field → lead target
 * 3. If element name contains "first" and type is text → lead.firstName
 * 4. If element name contains "last" and type is text → lead.lastName
 * 5. Otherwise → submission only (no lead mapping)
 */
export function detectFieldMapping(element: FormElement): FieldMappingTarget {
  // If element explicitly references a dataset field, use that
  if (element.datasetFieldRef) {
    return {
      type: 'customData',
      datasetId: element.datasetFieldRef.datasetId,
      fieldId: element.datasetFieldRef.fieldId,
      fieldSlug: element.datasetFieldRef.fieldSlug,
    }
  }

  // Check for direct type match (email, phone, address, etc.)
  const directMapping = ELEMENT_TYPE_TO_LEAD_FIELD[element.type]
  if (directMapping) {
    return { type: 'lead', field: directMapping }
  }

  // Check for name-based patterns for text fields
  if (element.type === 'text') {
    const nameLower = element.name.toLowerCase()

    // Check for firstName patterns
    if (
      nameLower.includes('firstname') ||
      nameLower.includes('first_name') ||
      nameLower.includes('first-name') ||
      (nameLower.includes('name') && nameLower.includes('first'))
    ) {
      return { type: 'lead', field: 'firstName' }
    }

    // Check for lastName patterns
    if (
      nameLower.includes('lastname') ||
      nameLower.includes('last_name') ||
      nameLower.includes('last-name') ||
      (nameLower.includes('name') && nameLower.includes('last'))
    ) {
      return { type: 'lead', field: 'lastName' }
    }
  }

  // Default: store only in submission, no lead mapping
  return { type: 'submission' }
}

/**
 * Mapping entry for a single form element.
 */
export interface ElementMapping {
  element: FormElement
  target: FieldMappingTarget
}

/**
 * Build mappings for all elements in a form.
 *
 * @param elements - Array of form elements
 * @returns Map of element name to mapping info
 */
export function buildFieldMappings(elements: FormElement[]): Map<string, ElementMapping> {
  const mappings = new Map<string, ElementMapping>()

  for (const element of elements) {
    // Skip non-input elements (layout elements like heading, divider, etc.)
    if (!isInputElement(element.type)) {
      continue
    }

    mappings.set(element.name, {
      element,
      target: detectFieldMapping(element),
    })
  }

  return mappings
}

/**
 * Layout element types that don't collect data.
 */
const NON_INPUT_ELEMENT_TYPES: readonly FormElementType[] = [
  'heading',
  'paragraph',
  'divider',
  'spacer',
  'submit',
] as const

/**
 * Check if an element type is an input element (collects data).
 * Layout elements like heading, paragraph, divider don't collect data.
 */
export function isInputElement(type: FormElementType): boolean {
  return !NON_INPUT_ELEMENT_TYPES.includes(type)
}

/**
 * Type guard to check if a value is a valid form submission value.
 */
export function isValidSubmissionValue(value: unknown): value is FormSubmissionValue {
  if (value === null) return true
  if (typeof value === 'string') return true
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) {
    return value.every(item => typeof item === 'string' || typeof item === 'number')
  }
  return false
}

/**
 * Safely extract a string value from submission data.
 * Returns null if the value is not a string.
 */
export function extractStringValue(value: FormSubmissionValue): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim()
  }
  return null
}
