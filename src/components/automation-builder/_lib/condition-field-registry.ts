/**
 * ============================================================================
 * CONDITION FIELD REGISTRY
 * ============================================================================
 *
 * Central registry of fields available for Branch condition rules.
 * Uses a curated list of condition-relevant fields (not ALL variables)
 * to keep the dropdown manageable and useful.
 *
 * Fields are grouped into:
 * - SHARED fields: Always available (Lead, Tag)
 * - TRIGGER-SPECIFIC fields: Only appear when the relevant trigger is connected
 * - META fields: Special system fields like _triggerType
 *
 * Each field maps to a pickerType that determines which value input to render
 * (text, form dropdown, pipeline dropdown, lead status enum, etc.)
 *
 * SOURCE OF TRUTH KEYWORDS: ConditionFieldRegistry, FieldPickerMap,
 * BranchConditionFields, ContextAwareConditionFields
 */

import type { BranchPickerType, AutomationTriggerType } from './types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Condition field entry for the Branch config dropdown.
 * Contains everything the UI needs to render a field option.
 */
export interface ConditionFieldEntry {
  /** Variable key (e.g., 'lead.email', 'trigger.form.name', '_triggerType') */
  key: string
  /** Human-readable label for the dropdown */
  label: string
  /** Category name for grouping in the dropdown */
  category: string
  /** Which picker to render for the value input when this field is selected */
  pickerType: BranchPickerType
}

// ============================================================================
// CURATED CONDITION FIELDS
// ============================================================================

/**
 * Shared fields — always available regardless of trigger type.
 * Paths must match the VariableContext structure exactly (SOURCE OF TRUTH: variables/types.ts).
 * lead.tags is a string[] of tag names — use 'contains' operator to check membership.
 */
const SHARED_CONDITION_FIELDS: ConditionFieldEntry[] = [
  { key: 'lead.email', label: 'Lead Email', category: 'Lead', pickerType: 'text' },
  { key: 'lead.firstName', label: 'Lead First Name', category: 'Lead', pickerType: 'text' },
  { key: 'lead.lastName', label: 'Lead Last Name', category: 'Lead', pickerType: 'text' },
  { key: 'lead.phone', label: 'Lead Phone', category: 'Lead', pickerType: 'text' },
  { key: 'lead.status', label: 'Lead Status', category: 'Lead', pickerType: 'lead_status' },
  { key: 'lead.source', label: 'Lead Source', category: 'Lead', pickerType: 'text' },
  { key: 'lead.tags', label: 'Lead Tags', category: 'Lead', pickerType: 'tag' },
]

/**
 * Trigger-specific condition fields — only shown when the relevant trigger is connected.
 * Maps each trigger type to its unique condition-relevant fields.
 *
 * IMPORTANT: All paths must resolve against the VariableContext at runtime.
 * SOURCE OF TRUTH for trigger paths: TriggerVariableContext in variables/types.ts
 * SOURCE OF TRUTH for lead paths: LeadVariableContext in variables/types.ts
 *
 * Pickers that use entity selects (form, pipeline, pipeline_stage, calendar)
 * store entity IDs as the value — the runtime context fields also hold IDs
 * so equals comparison works: selectedId === contextId.
 */
const TRIGGER_CONDITION_FIELDS: Record<AutomationTriggerType, ConditionFieldEntry[]> = {
  form_submitted: [
    { key: 'trigger.form.id', label: 'Form', category: 'Form', pickerType: 'form' },
    { key: 'trigger.form.name', label: 'Form Name', category: 'Form', pickerType: 'text' },
    { key: 'trigger.submissionData.email', label: 'Submitted Email', category: 'Form Submission', pickerType: 'text' },
    { key: 'trigger.submissionData.name', label: 'Submitted Name', category: 'Form Submission', pickerType: 'text' },
  ],
  pipeline_ticket_moved: [
    { key: 'trigger.ticket.pipelineId', label: 'Pipeline', category: 'Pipeline', pickerType: 'pipeline' },
    { key: 'trigger.ticket.fromStageId', label: 'From Stage', category: 'Pipeline', pickerType: 'pipeline_stage' },
    { key: 'trigger.ticket.toStageId', label: 'To Stage', category: 'Pipeline', pickerType: 'pipeline_stage' },
    { key: 'trigger.ticket.fromStageName', label: 'From Stage Name', category: 'Pipeline', pickerType: 'text' },
    { key: 'trigger.ticket.toStageName', label: 'To Stage Name', category: 'Pipeline', pickerType: 'text' },
  ],
  payment_completed: [
    { key: 'trigger.transaction.amount', label: 'Payment Amount', category: 'Payment', pickerType: 'text' },
    { key: 'trigger.transaction.currency', label: 'Currency', category: 'Payment', pickerType: 'text' },
    { key: 'trigger.transaction.amountFormatted', label: 'Amount (Formatted)', category: 'Payment', pickerType: 'text' },
    { key: 'lead.transaction.billingType', label: 'Billing Type', category: 'Payment', pickerType: 'billing_type' },
    { key: 'lead.transaction.paymentStatus', label: 'Payment Status', category: 'Payment', pickerType: 'payment_status' },
  ],
  appointment_scheduled: [
    { key: 'trigger.appointment.calendarId', label: 'Calendar', category: 'Appointment', pickerType: 'calendar' },
    { key: 'trigger.appointment.title', label: 'Appointment Title', category: 'Appointment', pickerType: 'text' },
    { key: 'trigger.appointment.startDate', label: 'Start Date', category: 'Appointment', pickerType: 'text' },
  ],
  appointment_started: [
    { key: 'trigger.appointment.calendarId', label: 'Calendar', category: 'Appointment', pickerType: 'calendar' },
    { key: 'trigger.appointment.title', label: 'Appointment Title', category: 'Appointment', pickerType: 'text' },
    { key: 'trigger.appointment.startDate', label: 'Start Date', category: 'Appointment', pickerType: 'text' },
  ],
  trial_started: [
    { key: 'trigger.trial.productName', label: 'Product Name', category: 'Trial', pickerType: 'text' },
    { key: 'trigger.trial.priceName', label: 'Price Name', category: 'Trial', pickerType: 'text' },
    { key: 'trigger.trial.trialDays', label: 'Trial Duration (days)', category: 'Trial', pickerType: 'text' },
  ],
  subscription_renewed: [
    { key: 'trigger.subscription.productName', label: 'Product Name', category: 'Subscription', pickerType: 'text' },
    { key: 'trigger.subscription.priceName', label: 'Price Name', category: 'Subscription', pickerType: 'text' },
    { key: 'trigger.subscription.amount', label: 'Payment Amount', category: 'Subscription', pickerType: 'text' },
    { key: 'trigger.subscription.paymentNumber', label: 'Payment Number', category: 'Subscription', pickerType: 'text' },
  ],
  subscription_cancelled: [
    { key: 'trigger.cancellation.productName', label: 'Product Name', category: 'Cancellation', pickerType: 'text' },
    { key: 'trigger.cancellation.priceName', label: 'Price Name', category: 'Cancellation', pickerType: 'text' },
    { key: 'trigger.cancellation.reason', label: 'Cancel Reason', category: 'Cancellation', pickerType: 'text' },
  ],
}

// ============================================================================
// FIELD-TO-PICKER MAPPING (for reverse lookups)
// ============================================================================

/**
 * Build a flat lookup from field key to picker type.
 * Used by getPickerTypeForField() for fields selected from the dropdown.
 */
const FIELD_PICKER_MAP: Record<string, BranchPickerType> = {}

// Populate from shared fields
for (const field of SHARED_CONDITION_FIELDS) {
  FIELD_PICKER_MAP[field.key] = field.pickerType
}
// Populate from trigger-specific fields
for (const fields of Object.values(TRIGGER_CONDITION_FIELDS)) {
  for (const field of fields) {
    FIELD_PICKER_MAP[field.key] = field.pickerType
  }
}
// Meta field
FIELD_PICKER_MAP['_triggerType'] = 'trigger_type'

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the picker type for a given field key.
 * Falls back to 'text' for any field not explicitly mapped.
 */
export function getPickerTypeForField(fieldKey: string): BranchPickerType {
  return FIELD_PICKER_MAP[fieldKey] ?? 'text'
}

/**
 * Build condition fields from connected trigger types.
 *
 * Returns a curated list of condition-relevant fields:
 * 1. _triggerType meta-field (when triggers exist)
 * 2. Shared fields (Lead, Tag) — always available
 * 3. Trigger-specific fields — only for connected trigger types
 *
 * Fields are deduplicated by key (if multiple triggers share the same field).
 */
export function getConditionFieldsForTriggers(
  triggerTypes: AutomationTriggerType[]
): ConditionFieldEntry[] {
  const fields: ConditionFieldEntry[] = []
  const seenKeys = new Set<string>()

  // Add _triggerType meta-field when triggers exist
  if (triggerTypes.length > 0) {
    fields.push({
      key: '_triggerType',
      label: 'Trigger Type',
      category: 'Meta',
      pickerType: 'trigger_type',
    })
    seenKeys.add('_triggerType')
  }

  // Add shared condition fields (Lead, Tag)
  for (const field of SHARED_CONDITION_FIELDS) {
    if (!seenKeys.has(field.key)) {
      seenKeys.add(field.key)
      fields.push(field)
    }
  }

  // Add trigger-specific fields for each connected trigger type
  for (const triggerType of triggerTypes) {
    const triggerFields = TRIGGER_CONDITION_FIELDS[triggerType]
    if (!triggerFields) continue

    for (const field of triggerFields) {
      if (!seenKeys.has(field.key)) {
        seenKeys.add(field.key)
        fields.push(field)
      }
    }
  }

  return fields
}
