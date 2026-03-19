/**
 * ============================================================================
 * AUTOMATION NODE CONFIG VALIDATION SCHEMAS
 * ============================================================================
 *
 * Zod schemas for validating node configurations in the automation builder.
 * Used by the properties drawer Save button to validate before closing.
 *
 * Fields are marked required or optional based on what the execution engine
 * actually needs to run the automation successfully.
 *
 * TRIGGERS: Mostly optional fields (e.g., "Any form" is valid)
 * ACTIONS: Have required fields (e.g., must select a template to send email)
 * CONDITIONS: Require at least one rule to evaluate
 *
 * SOURCE OF TRUTH KEYWORDS: ConfigSchemas, NodeConfigValidation, ZodConfigSchema
 */

import { z } from 'zod'
import type { TriggerConfig, ActionConfig, ConditionConfig } from './types'

// ============================================================================
// TRIGGER SCHEMAS
// ============================================================================

/** Form Submitted — all optional since "Any form" is valid */
const formSubmittedSchema = z.object({
  type: z.literal('form_submitted'),
  formId: z.string().optional(),
  formName: z.string().optional(),
})

/** Pipeline Ticket Updated — all optional (any pipeline, any stage) */
const pipelineTicketMovedSchema = z.object({
  type: z.literal('pipeline_ticket_moved'),
  pipelineId: z.string().optional(),
  pipelineName: z.string().optional(),
  fromStageId: z.string().optional(),
  fromStageName: z.string().optional(),
  toStageId: z.string().optional(),
  toStageName: z.string().optional(),
})

/** Payment Completed — filter by product, price, amount, currency, or billing type (all optional) */
const paymentCompletedSchema = z.object({
  type: z.literal('payment_completed'),
  minAmount: z.number().positive('Minimum amount must be greater than 0').optional(),
  currency: z.string().optional(),
  productId: z.string().optional(),
  productName: z.string().optional(),
  priceId: z.string().optional(),
  priceName: z.string().optional(),
  /** Legacy: kept for backward compat with existing automations */
  paymentLinkId: z.string().optional(),
})

/** Trial Started — filter by product or price (all optional) */
const trialStartedSchema = z.object({
  type: z.literal('trial_started'),
  productId: z.string().optional(),
  productName: z.string().optional(),
  priceId: z.string().optional(),
  priceName: z.string().optional(),
})

/** Subscription Renewed — filter by product, price, or minimum amount (all optional) */
const subscriptionRenewedSchema = z.object({
  type: z.literal('subscription_renewed'),
  productId: z.string().optional(),
  productName: z.string().optional(),
  priceId: z.string().optional(),
  priceName: z.string().optional(),
  minAmount: z.number().positive('Minimum amount must be greater than 0').optional(),
})

/** Subscription Cancelled — filter by product or price (all optional) */
const subscriptionCancelledSchema = z.object({
  type: z.literal('subscription_cancelled'),
  productId: z.string().optional(),
  productName: z.string().optional(),
  priceId: z.string().optional(),
  priceName: z.string().optional(),
})

/** Appointment Scheduled — calendar selection is optional */
const appointmentScheduledSchema = z.object({
  type: z.literal('appointment_scheduled'),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
})

/** Appointment Started — calendar selection is optional */
const appointmentStartedSchema = z.object({
  type: z.literal('appointment_started'),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
})

// ============================================================================
// ACTION SCHEMAS
// ============================================================================

/**
 * Send Email — supports two modes:
 * - template: requires emailTemplateId
 * - body: requires subject and body text
 * Both require fromEmail. Uses superRefine for conditional validation.
 */
const sendEmailSchema = z.object({
  type: z.literal('send_email'),
  mode: z.enum(['template', 'body']).optional(),
  emailTemplateId: z.string().optional(),
  emailTemplateName: z.string().optional(),
  subjectOverride: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  fromEmail: z.string().optional(),
  fromName: z.string().optional(),
}).superRefine((data, ctx) => {
  /* fromEmail is always required */
  if (!data.fromEmail || data.fromEmail.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromEmail'], message: 'Sender email is required' })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.fromEmail)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromEmail'], message: 'Must be a valid email address' })
  }

  /* fromName is always required */
  if (!data.fromName || data.fromName.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromName'], message: 'Sender name is required' })
  }

  const mode = data.mode ?? 'template'
  if (mode === 'template') {
    if (!data.emailTemplateId || data.emailTemplateId.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['emailTemplateId'], message: 'Email template is required' })
    }
  } else {
    if (!data.subject || data.subject.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subject'], message: 'Subject is required' })
    }
    if (!data.body || data.body.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Email body is required' })
    }
  }
})

/** Add Tag — must select at least one tag */
const addTagSchema = z.object({
  type: z.literal('add_tag'),
  tags: z.array(z.object({ id: z.string(), name: z.string() })).min(1, 'Select at least one tag'),
})

/** Remove Tag — must select at least one tag */
const removeTagSchema = z.object({
  type: z.literal('remove_tag'),
  tags: z.array(z.object({ id: z.string(), name: z.string() })).min(1, 'Select at least one tag'),
})

/** Create Pipeline Ticket — must select pipeline and stage */
const createPipelineTicketSchema = z.object({
  type: z.literal('create_pipeline_ticket'),
  pipelineId: z.string({ message: 'Pipeline is required' }).min(1, 'Pipeline is required'),
  pipelineName: z.string().optional(),
  stageId: z.string({ message: 'Stage is required' }).min(1, 'Stage is required'),
  stageName: z.string().optional(),
  titleTemplate: z.string().optional(),
  descriptionTemplate: z.string().optional(),
  valueTemplate: z.string().optional(),
})

/** Update Pipeline Ticket — must select pipeline and target stage */
const updatePipelineTicketSchema = z.object({
  type: z.literal('update_pipeline_ticket'),
  pipelineId: z.string({ message: 'Pipeline is required' }).min(1, 'Pipeline is required'),
  pipelineName: z.string().optional(),
  toStageId: z.string({ message: 'Target stage is required' }).min(1, 'Target stage is required'),
  toStageName: z.string().optional(),
})

/** Wait Delay — must specify amount (positive) and unit */
const waitDelaySchema = z.object({
  type: z.literal('wait_delay'),
  delayAmount: z.number({ message: 'Delay amount is required' }).positive('Delay must be greater than 0'),
  delayUnit: z.enum(['minutes', 'hours', 'days'], { message: 'Delay unit is required' }),
})

/** Wait For Event — must specify event type, optional calendar filter for appointment events */
const waitForEventSchema = z.object({
  type: z.literal('wait_for_event'),
  eventType: z.enum(['appointment_started', 'email_opened', 'email_clicked'], { message: 'Event type is required' }),
  sourceEmailNodeId: z.string().optional(),
  sourceEmailNodeLabel: z.string().optional(),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
  timeoutHours: z.number().positive('Timeout must be greater than 0').optional(),
  timeoutAction: z.enum(['continue', 'stop']).optional(),
})

/** Send Notification — must have title and body */
const sendNotificationSchema = z.object({
  type: z.literal('send_notification'),
  titleTemplate: z.string({ message: 'Title is required' }).min(1, 'Title is required'),
  bodyTemplate: z.string({ message: 'Body is required' }).min(1, 'Body is required'),
  notifyMemberIds: z.array(z.string()).optional(),
  channel: z.enum(['in_app', 'email', 'both']).optional(),
})

/**
 * Checks if a webhook URL targets a blocked/internal host.
 * Client-side validation to give users immediate feedback before save.
 * The server-side check in url-validation.ts also performs DNS resolution for full SSRF protection.
 */
function isBlockedWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url)

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only http:// and https:// URLs are allowed'
    }

    const hostname = parsed.hostname.toLowerCase()

    // Block localhost and loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      return 'Localhost URLs are not allowed for webhooks'
    }

    // Block cloud metadata endpoints
    if (
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal'
    ) {
      return 'Internal/metadata URLs are not allowed'
    }

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const ipParts = hostname.split('.').map(Number)
    if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p))) {
      const [a, b] = ipParts
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return 'Private/internal IP addresses are not allowed for webhooks'
      }
    }

    return null
  } catch {
    return 'Invalid URL'
  }
}

/** Call Webhook — must have URL and method. URL is validated against internal/private targets. */
const callWebhookSchema = z.object({
  type: z.literal('call_webhook'),
  url: z
    .string({ message: 'URL is required' })
    .min(1, 'URL is required')
    .url('Must be a valid URL')
    .superRefine((url, ctx) => {
      const blocked = isBlockedWebhookUrl(url)
      if (blocked) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: blocked })
      }
    }),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], { message: 'Method is required' }),
  headers: z.record(z.string(), z.string()).optional(),
  bodyTemplate: z.string().optional(),
  contentType: z.enum(['application/json', 'application/x-www-form-urlencoded']).optional(),
})

// ============================================================================
// CONDITION SCHEMAS
// ============================================================================

/** Condition Rule — field and operator are required */
const conditionRuleSchema = z.object({
  id: z.string(),
  field: z.string().min(1, 'Field is required'),
  fieldLabel: z.string(),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_empty',
    'is_not_empty',
    'greater_than',
    'less_than',
    'greater_or_equal',
    'less_or_equal',
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

/** If/Else — must have at least one condition rule */
const ifElseSchema = z.object({
  type: z.literal('if_else'),
  conditions: z.array(conditionRuleSchema).min(1, 'At least one condition is required'),
  logicalOperator: z.enum(['and', 'or']),
})

/** Branch condition rule — same as condition rule but with optional pickerType and per-rule logicalOperator */
const branchConditionRuleSchema = z.object({
  id: z.string(),
  field: z.string().min(1, 'Field is required'),
  fieldLabel: z.string(),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_empty',
    'is_not_empty',
    'greater_than',
    'less_than',
    'greater_or_equal',
    'less_or_equal',
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
  pickerType: z.string().optional(),
  /** Per-rule AND/OR connector — first rule doesn't need this */
  logicalOperator: z.enum(['and', 'or']).optional(),
})

/** Branch definition — one branch path with its own conditions */
const branchDefinitionSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Branch label is required'),
  conditions: z.array(branchConditionRuleSchema).min(1, 'At least one condition is required'),
  logicalOperator: z.enum(['and', 'or']),
})

/** Branch — must have 1-5 branches with conditions */
const branchConfigSchema = z.object({
  type: z.literal('branch'),
  branches: z.array(branchDefinitionSchema)
    .min(1, 'At least one branch is required')
    .max(5, 'Maximum 5 branches allowed'),
  hasDefault: z.literal(true),
})

// ============================================================================
// DISCRIMINATED UNIONS
// ============================================================================

/** Combined trigger config schema */
const triggerConfigSchema = z.discriminatedUnion('type', [
  formSubmittedSchema,
  pipelineTicketMovedSchema,
  paymentCompletedSchema,
  appointmentScheduledSchema,
  appointmentStartedSchema,
  trialStartedSchema,
  subscriptionRenewedSchema,
  subscriptionCancelledSchema,
])

/** Combined action config schema */
const actionConfigSchema = z.discriminatedUnion('type', [
  sendEmailSchema,
  addTagSchema,
  removeTagSchema,
  createPipelineTicketSchema,
  updatePipelineTicketSchema,
  waitDelaySchema,
  waitForEventSchema,
  sendNotificationSchema,
  callWebhookSchema,
])

/** Combined condition config schema */
const conditionConfigSchema = z.discriminatedUnion('type', [ifElseSchema, branchConfigSchema])

// ============================================================================
// PUBLIC API
// ============================================================================

// ============================================================================
// VALIDATION RESULT TYPE
// ============================================================================

/**
 * Validation result containing field-level errors.
 * Keys are dot-separated field paths (e.g., "emailTemplateId", "conditions.0.field").
 * Values are the human-readable error messages.
 *
 * SOURCE OF TRUTH KEYWORDS: NodeConfigFieldErrors, FieldErrorMap
 */
export type FieldErrors = Record<string, string>

/**
 * Convert Zod issues into a field error map.
 * Joins path components with dots (e.g., ["conditions", 0, "field"] → "conditions.0.field").
 * When multiple errors exist for the same field, the first one wins.
 */
function zodIssuesToFieldErrors(issues: z.ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const key = issue.path.length > 0
      ? issue.path.join('.')
      : '_root'
    // Keep the first error per field — Zod orders from most specific to least
    if (!(key in errors)) {
      errors[key] = issue.message
    }
  }
  return errors
}

/**
 * Validate a trigger config against its Zod schema.
 * Returns a field-level error map, or empty object if valid.
 */
export function validateTriggerConfig(config: TriggerConfig): FieldErrors {
  const result = triggerConfigSchema.safeParse(config)
  if (result.success) return {}
  return zodIssuesToFieldErrors(result.error.issues)
}

/**
 * Validate an action config against its Zod schema.
 * Returns a field-level error map, or empty object if valid.
 */
export function validateActionConfig(config: ActionConfig): FieldErrors {
  const result = actionConfigSchema.safeParse(config)
  if (result.success) return {}
  return zodIssuesToFieldErrors(result.error.issues)
}

/**
 * Validate a condition config against its Zod schema.
 * Returns a field-level error map, or empty object if valid.
 */
export function validateConditionConfig(config: ConditionConfig): FieldErrors {
  const result = conditionConfigSchema.safeParse(config)
  if (result.success) return {}
  return zodIssuesToFieldErrors(result.error.issues)
}

/**
 * Validate any node config based on its category.
 * Returns a field-level error map, or empty object if valid.
 */
export function validateNodeConfig(
  category: 'trigger' | 'action' | 'condition' | 'control',
  config: TriggerConfig | ActionConfig | ConditionConfig
): FieldErrors {
  switch (category) {
    case 'trigger':
      return validateTriggerConfig(config as TriggerConfig)
    case 'action':
    case 'control':
      return validateActionConfig(config as ActionConfig)
    case 'condition':
      return validateConditionConfig(config as ConditionConfig)
    default:
      return {}
  }
}
