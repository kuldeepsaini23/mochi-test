/**
 * Variable Context Builder
 *
 * Builds the complete VariableContext for template interpolation.
 * Aggregates data from Lead, CustomData, Transactions, Submissions, and Organization.
 *
 * Design Principles:
 * - Smart defaults: null/undefined becomes empty string
 * - Pre-formatted values: currency amounts formatted for display
 * - Flat custom data: all fields accessible via fieldSlug directly
 * - Singular accessors: transaction/submission point to latest by default
 */

import type { Prisma, FormSubmission } from '@/generated/prisma'
import { getResponsesForLead } from '@/services/custom-data.service'
import { getLeadWithRelationsForContext } from '@/services/leads.service'
import { getLeadSubmissionsForContext } from '@/services/form-submission.service'
import { getOrganizationForContext } from '@/services/organization.service'
import {
  type VariableContext,
  type LeadVariableContext,
  type TransactionVariableContext,
  type SubmissionVariableContext,
  type OrganizationVariableContext,
  type NowVariableContext,
  type TriggerVariableContext,
  type VariableContextOptions,
  type TriggerContextInput,
  EMPTY_TRANSACTION,
  EMPTY_SUBMISSION,
  EMPTY_ORGANIZATION,
  EMPTY_LEAD,
  EMPTY_TRIGGER,
} from './types'
import { formatCurrency } from './format-utils'

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Build a complete variable context for a lead.
 *
 * This aggregates ALL data related to a lead into a single object
 * for use in template interpolation.
 *
 * @param organizationId - Organization context
 * @param leadId - Target lead
 * @param options - What additional data to include
 * @returns Complete VariableContext ready for interpolation
 *
 * @example
 * const context = await buildVariableContext(orgId, leadId)
 * const result = interpolate('Hello {{lead.firstName}}!', context)
 */
export async function buildVariableContext(
  organizationId: string,
  leadId: string,
  options: VariableContextOptions = {}
): Promise<VariableContext> {
  // Fetch all data in parallel for performance
  const [lead, customDataResponses, organization, formSubmissions] = await Promise.all([
    fetchLeadWithRelations(leadId, organizationId, options),
    getResponsesForLead(organizationId, leadId),
    fetchOrganization(organizationId),
    fetchLeadSubmissions(leadId, options),
  ])

  if (!lead) {
    // When gracefulDefaults is enabled (automation execution), return EMPTY_LEAD
    // instead of throwing. Each action executor then checks if it has what it needs
    // and throws SkipActionError with a clear reason for the user.
    if (options.gracefulDefaults) {
      const organizationContext = organization
        ? buildOrganizationContext(organization)
        : EMPTY_ORGANIZATION
      const nowContext = buildNowContext()
      const triggerContext = options.triggerData
        ? buildTriggerContext(options.triggerData)
        : undefined

      return {
        lead: EMPTY_LEAD,
        organization: organizationContext,
        now: nowContext,
        submission: undefined,
        trigger: triggerContext,
      }
    }
    throw new Error(`Lead not found: ${leadId}`)
  }

  // Build custom data map (flat by field slug)
  const customData = buildFlatCustomData(customDataResponses)

  // Build transaction contexts
  const transactions = buildTransactionContexts(lead.transactions)
  const latestTransaction = transactions[0] ?? EMPTY_TRANSACTION

  // Build submission contexts
  const submissions = buildSubmissionContexts(formSubmissions)
  const latestSubmission = submissions[0] ?? EMPTY_SUBMISSION

  // Find current submission if specified
  let currentSubmission: SubmissionVariableContext | undefined
  if (options.currentSubmissionId) {
    currentSubmission = submissions.find(s => s.id === options.currentSubmissionId)
  }

  // Build lead context
  const leadContext = buildLeadContext(
    lead,
    customData,
    latestTransaction,
    transactions,
    latestSubmission,
    submissions
  )

  // Build organization context
  const organizationContext = organization
    ? buildOrganizationContext(organization)
    : EMPTY_ORGANIZATION

  // Build now context
  const nowContext = buildNowContext()

  // Build trigger context (for automation execution)
  const triggerContext = options.triggerData
    ? buildTriggerContext(options.triggerData)
    : undefined

  return {
    lead: leadContext,
    organization: organizationContext,
    now: nowContext,
    submission: currentSubmission,
    trigger: triggerContext,
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Lead with tags and transactions.
 */
type LeadWithRelations = Prisma.LeadGetPayload<{
  include: {
    tags: { include: { tag: true } }
    transactions: true
  }
}>

/**
 * Fetch lead with tags and transactions.
 * Delegates to leads.service.ts for database access.
 */
async function fetchLeadWithRelations(
  leadId: string,
  organizationId: string,
  options: VariableContextOptions
): Promise<LeadWithRelations | null> {
  return await getLeadWithRelationsForContext(leadId, organizationId, {
    includeAllTransactions: options.includeAllTransactions,
  })
}

/**
 * Submission with form name.
 */
type SubmissionWithForm = FormSubmission & {
  form: { name: string }
}

/**
 * Fetch form submissions for a lead.
 * Delegates to form-submission.service.ts for database access.
 * FormSubmission has leadId but no back-relation on Lead model.
 */
async function fetchLeadSubmissions(
  leadId: string,
  options: VariableContextOptions
): Promise<SubmissionWithForm[]> {
  return await getLeadSubmissionsForContext(leadId, {
    includeAllSubmissions: options.includeAllSubmissions,
  })
}

/**
 * Organization data for context.
 */
type OrganizationData = {
  id: string
  name: string
  slug: string
  logo: string | null
  customDomain: string | null
}

/**
 * Fetch organization data.
 * Delegates to organization.service.ts for database access.
 */
async function fetchOrganization(organizationId: string): Promise<OrganizationData | null> {
  return await getOrganizationForContext(organizationId)
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

/**
 * Custom data response shape from getResponsesForLead.
 */
interface CustomDataResponseItem {
  categoryId: string
  categoryName: string
  categorySlug: string
  categoryIcon: string | null
  values: Prisma.JsonValue
  version: number
  updatedAt: Date | null
}

/**
 * Build flat custom data map from responses.
 *
 * Flattens all custom data fields into a single object keyed by field slug.
 * If multiple datasets have the same field slug, the last one wins.
 * This is intentional for simple access patterns.
 */
function buildFlatCustomData(
  responses: CustomDataResponseItem[]
): Record<string, string | number | boolean | string[]> {
  const flatData: Record<string, string | number | boolean | string[]> = {}

  for (const response of responses) {
    const values = response.values as Record<string, unknown> | null
    if (!values) continue

    for (const [fieldSlug, value] of Object.entries(values)) {
      // Only include primitive values and string arrays
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        flatData[fieldSlug] = value
      } else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
        flatData[fieldSlug] = value as string[]
      }
    }
  }

  return flatData
}

/**
 * Build lead variable context.
 */
function buildLeadContext(
  lead: LeadWithRelations,
  customData: Record<string, string | number | boolean | string[]>,
  latestTransaction: TransactionVariableContext,
  allTransactions: TransactionVariableContext[],
  latestSubmission: SubmissionVariableContext,
  allSubmissions: SubmissionVariableContext[]
): LeadVariableContext {
  const firstName = lead.firstName ?? ''
  const lastName = lead.lastName ?? ''

  return {
    id: lead.id,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Unknown',
    email: lead.email,
    phone: lead.phone ?? '',
    address: lead.address ?? '',
    address2: lead.address2 ?? '',
    city: lead.city ?? '',
    state: lead.state ?? '',
    zipCode: lead.zipCode ?? '',
    country: lead.country ?? '',
    status: lead.status,
    source: lead.source ?? '',
    cltv: lead.cltv,
    cltvFormatted: formatCurrency(lead.cltv * 100, 'usd'), // cltv is in dollars
    location: lead.location,
    locationCode: lead.locationCode,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    lastActivityAt: lead.lastActivityAt.toISOString(),
    customData,
    tags: lead.tags.map(ta => ta.tag.name),
    transaction: latestTransaction,
    transactions: allTransactions,
    submission: latestSubmission,
    submissions: allSubmissions,
  }
}

/**
 * Build transaction variable contexts from database records.
 */
function buildTransactionContexts(
  transactions: LeadWithRelations['transactions']
): TransactionVariableContext[] {
  return transactions.map(tx => ({
    id: tx.id,
    originalAmount: tx.originalAmount,
    paidAmount: tx.paidAmount,
    refundedAmount: tx.refundedAmount,
    currency: tx.currency,
    originalAmountFormatted: formatCurrency(tx.originalAmount, tx.currency),
    paidAmountFormatted: formatCurrency(tx.paidAmount, tx.currency),
    refundedAmountFormatted: formatCurrency(tx.refundedAmount, tx.currency),
    paymentStatus: tx.paymentStatus,
    billingType: tx.billingType,
    totalPayments: tx.totalPayments,
    successfulPayments: tx.successfulPayments,
    createdAt: tx.createdAt.toISOString(),
    firstPaidAt: tx.firstPaidAt?.toISOString() ?? '',
    lastPaidAt: tx.lastPaidAt?.toISOString() ?? '',
  }))
}

/**
 * Build submission variable contexts from database records.
 */
function buildSubmissionContexts(
  submissions: SubmissionWithForm[]
): SubmissionVariableContext[] {
  return submissions.map(sub => {
    // Parse submission data safely
    const rawData = sub.data as Record<string, unknown> | null
    const data: Record<string, string | number | boolean | string[]> = {}

    if (rawData) {
      for (const [key, value] of Object.entries(rawData)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          data[key] = value
        } else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
          data[key] = value as string[]
        }
      }
    }

    return {
      id: sub.id,
      formId: sub.formId,
      formName: sub.form.name,
      submittedAt: sub.createdAt.toISOString(),
      data,
    }
  })
}

/**
 * Build organization variable context.
 */
function buildOrganizationContext(org: OrganizationData): OrganizationVariableContext {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo ?? '',
    customDomain: org.customDomain ?? '',
  }
}

/**
 * Build current date/time context.
 */
function buildNowContext(): NowVariableContext {
  const now = new Date()

  return {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0],
    datetime: now.toISOString(),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    dayOfWeek: now.getDay(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  }
}

// ============================================================================
// TRIGGER CONTEXT BUILDER (AUTOMATION)
// ============================================================================

/**
 * Build trigger variable context from trigger input data.
 *
 * Transforms the raw trigger data (from automation run) into a structured
 * context for variable interpolation.
 *
 * @param input - Raw trigger data from automation run
 * @returns TriggerVariableContext for use in templates
 *
 * @example
 * // {{trigger.form.name}} -> "Contact Form"
 * // {{trigger.transaction.amountFormatted}} -> "$99.00"
 */
function buildTriggerContext(input: TriggerContextInput): TriggerVariableContext {
  const context: TriggerVariableContext = {
    type: input.type,
  }

  // Build form context (FORM_SUBMITTED)
  if (input.formId || input.formName) {
    context.form = {
      id: input.formId ?? '',
      name: input.formName ?? '',
    }
  }

  // Build submission data (FORM_SUBMITTED)
  if (input.submissionData) {
    const data: Record<string, string | number | boolean | string[]> = {}
    for (const [key, value] of Object.entries(input.submissionData)) {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        data[key] = value
      } else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
        data[key] = value as string[]
      }
    }
    context.submissionData = data
  }

  /**
   * Build transaction context (PAYMENT_COMPLETED).
   * `amount` = per-item amount, `checkoutTotal` = full checkout amount.
   * SOURCE OF TRUTH: PerItemTriggerAmount, CheckoutTotalTriggerAmount
   */
  if (input.transactionId || input.amount !== undefined) {
    const currency = input.currency ?? 'usd'
    const checkoutTotal = input.checkoutTotal ?? input.amount ?? 0
    context.transaction = {
      id: input.transactionId ?? '',
      amount: input.amount ?? 0,
      amountFormatted: formatCurrency(input.amount ?? 0, currency),
      checkoutTotal,
      checkoutTotalFormatted: formatCurrency(checkoutTotal, currency),
      currency,
      paymentLinkId: input.paymentLinkId ?? '',
    }
  }

  // Build ticket context (PIPELINE_TICKET_MOVED)
  if (input.ticketId || input.pipelineId) {
    context.ticket = {
      id: input.ticketId ?? '',
      pipelineId: input.pipelineId ?? '',
      fromStageId: input.fromStageId ?? '',
      fromStageName: input.fromStageName ?? '',
      toStageId: input.toStageId ?? '',
      toStageName: input.toStageName ?? '',
    }
  }

  // Build appointment context (APPOINTMENT_SCHEDULED, APPOINTMENT_STARTED)
  if (input.appointmentId || input.calendarId) {
    const startDate = input.startDate
      ? (typeof input.startDate === 'string' ? input.startDate : input.startDate.toISOString())
      : ''
    const endDate = input.endDate
      ? (typeof input.endDate === 'string' ? input.endDate : input.endDate.toISOString())
      : ''

    context.appointment = {
      id: input.appointmentId ?? '',
      calendarId: input.calendarId ?? '',
      title: input.appointmentTitle ?? '',
      startDate,
      endDate,
    }
  }

  // Trial context — TRIAL_STARTED trigger
  // Populates product name, plan name, trial duration, and computed end date
  if (input.type === 'TRIAL_STARTED' && input.productName) {
    context.trial = {
      productName: input.productName ?? '',
      priceName: input.priceName ?? '',
      trialDays: input.trialDays ?? 0,
      trialEndsAt: input.trialEndsAt
        ? new Date(input.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '',
    }
  }

  // Subscription renewal context — SUBSCRIPTION_RENEWED trigger
  // Populates formatted payment amount, product info, and which payment number this is
  if (input.type === 'SUBSCRIPTION_RENEWED' && input.amount !== undefined) {
    const currency = input.currency ?? 'usd'
    context.subscription = {
      amount: input.amount ?? 0,
      amountFormatted: formatCurrency(input.amount ?? 0, currency),
      currency,
      productName: input.productName ?? '',
      priceName: input.priceName ?? '',
      paymentNumber: input.paymentNumber ?? 0,
    }
  }

  // Cancellation context — SUBSCRIPTION_CANCELLED trigger
  // Populates product info and the reason for cancellation (if provided by Stripe or user)
  if (input.type === 'SUBSCRIPTION_CANCELLED' && input.productName) {
    context.cancellation = {
      productName: input.productName ?? '',
      priceName: input.priceName ?? '',
      reason: input.cancelReason ?? 'Not specified',
    }
  }

  return context
}

/**
 * Build automation context for Trigger.dev task execution.
 *
 * Convenience function that wraps buildVariableContext with
 * automation-specific options.
 *
 * @param organizationId - Organization ID
 * @param leadId - Lead ID associated with the trigger
 * @param triggerData - Trigger-specific data
 * @returns Complete VariableContext with trigger data
 *
 * @example
 * const context = await buildAutomationContext(
 *   orgId,
 *   leadId,
 *   {
 *     type: 'FORM_SUBMITTED',
 *     formId: 'form_123',
 *     formName: 'Contact Form',
 *     submissionData: { message: 'Hello!' }
 *   }
 * )
 */
export async function buildAutomationContext(
  organizationId: string,
  leadId: string,
  triggerData: TriggerContextInput
): Promise<VariableContext> {
  return buildVariableContext(organizationId, leadId, {
    includeAllTransactions: false,
    includeAllSubmissions: false,
    gracefulDefaults: true,
    triggerData,
  })
}

// ============================================================================
// FORMATTING UTILITIES - Re-exported from format-utils.ts for backwards compatibility
// ============================================================================

export { formatCurrency, formatDate } from './format-utils'
