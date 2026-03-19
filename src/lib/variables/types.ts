/**
 * Variable System Types
 *
 * Defines the VariableContext structure used for template interpolation.
 * This provides a unified interface to access all lead-related data.
 *
 * Variable Syntax:
 * - {{lead.firstName}} - Standard lead fields
 * - {{lead.customData.fieldSlug}} - Custom dataset fields (flat access)
 * - {{lead.transaction.paidAmount}} - Latest transaction (singular, auto-first)
 * - {{organization.name}} - Organization fields
 *
 * Design Principles:
 * - All types derived from Prisma schema to prevent drift
 * - Smart defaults: missing values return empty string, not errors
 * - Singular accessors for arrays (transaction vs transactions)
 * - Flat custom data access (no dataset slug in path)
 */

import type { LeadStatus } from '@/generated/prisma'

// ============================================================================
// LEAD VARIABLE CONTEXT
// ============================================================================

/**
 * Lead data available in variable context.
 *
 * Access patterns:
 * - {{lead.firstName}}
 * - {{lead.email}}
 * - {{lead.customData.fieldSlug}}
 * - {{lead.transaction.paidAmount}}
 */
export interface LeadVariableContext {
  /** Unique lead ID */
  id: string

  // Contact Information
  firstName: string
  lastName: string
  /** Computed: firstName + lastName */
  fullName: string
  email: string
  phone: string

  // Address Information
  address: string
  address2: string
  city: string
  state: string
  zipCode: string
  country: string

  // Business Details
  status: LeadStatus
  source: string
  /** Customer Lifetime Value */
  cltv: number
  /** Formatted CLTV (e.g., "$1,234.00") */
  cltvFormatted: string

  // Location
  location: string
  locationCode: string

  // Timestamps (ISO strings for easy formatting)
  createdAt: string
  updatedAt: string
  lastActivityAt: string

  /**
   * Custom dataset fields - FLAT access by field slug.
   *
   * Example: {{lead.customData.purchasePreference}}
   * Note: Multiple datasets may have same field slug - last one wins.
   * This is intentional for simple access pattern.
   */
  customData: Record<string, string | number | boolean | string[]>

  /** Lead tags as array of names */
  tags: string[]

  /**
   * Latest transaction (singular access for convenience).
   * Returns empty object values if no transactions.
   *
   * Example: {{lead.transaction.paidAmount}}
   */
  transaction: TransactionVariableContext

  /**
   * All transactions as array.
   * Use when you need to iterate or access specific index.
   */
  transactions: TransactionVariableContext[]

  /**
   * Latest form submission (singular access).
   * Returns empty object values if no submissions.
   *
   * Example: {{lead.submission.formName}}
   */
  submission: SubmissionVariableContext

  /**
   * All form submissions as array.
   */
  submissions: SubmissionVariableContext[]
}

// ============================================================================
// TRANSACTION VARIABLE CONTEXT
// ============================================================================

/**
 * Transaction data available in variable context.
 *
 * Access patterns:
 * - {{lead.transaction.paidAmount}} - Latest transaction
 * - {{lead.transaction.paidAmountFormatted}} - Pre-formatted currency
 */
export interface TransactionVariableContext {
  id: string

  // Financial (in cents from DB, formatted versions provided)
  originalAmount: number
  paidAmount: number
  refundedAmount: number
  currency: string

  /** Pre-formatted original amount (e.g., "$99.00") */
  originalAmountFormatted: string
  /** Pre-formatted paid amount */
  paidAmountFormatted: string
  /** Pre-formatted refunded amount */
  refundedAmountFormatted: string

  // Status
  paymentStatus: string
  billingType: string
  totalPayments: number
  successfulPayments: number

  // Timestamps (ISO strings)
  createdAt: string
  firstPaidAt: string
  lastPaidAt: string
}

// ============================================================================
// SUBMISSION VARIABLE CONTEXT
// ============================================================================

/**
 * Form submission data available in variable context.
 *
 * Access patterns:
 * - {{lead.submission.formName}}
 * - {{submission.data.fieldName}} - When in submission context
 */
export interface SubmissionVariableContext {
  id: string
  formId: string
  formName: string
  submittedAt: string

  /** Raw submission data keyed by field name */
  data: Record<string, string | number | boolean | string[]>
}

// ============================================================================
// ORGANIZATION VARIABLE CONTEXT
// ============================================================================

/**
 * Organization data available in variable context.
 *
 * Access patterns:
 * - {{organization.name}}
 * - {{organization.logo}}
 */
export interface OrganizationVariableContext {
  id: string
  name: string
  slug: string
  logo: string
  customDomain: string
}

// ============================================================================
// NOW/DATE VARIABLE CONTEXT
// ============================================================================

/**
 * Current date/time utilities for templates.
 *
 * Access patterns:
 * - {{now.date}} - 2024-01-15
 * - {{now.year}} - 2024
 */
export interface NowVariableContext {
  /** ISO date string (YYYY-MM-DD) */
  date: string
  /** ISO time string (HH:mm:ss) */
  time: string
  /** Full ISO datetime string */
  datetime: string
  /** Year (e.g., 2024) */
  year: number
  /** Month (1-12) */
  month: number
  /** Day of month (1-31) */
  day: number
  /** Day of week (Sunday = 0) */
  dayOfWeek: number
  /** Hour (0-23) */
  hour: number
  /** Minute (0-59) */
  minute: number
}

// ============================================================================
// TRIGGER VARIABLE CONTEXT (AUTOMATION BUILDER)
// ============================================================================

/**
 * Trigger-specific data available in automation variable context.
 *
 * Access patterns:
 * - {{trigger.type}} - The trigger type (FORM_SUBMITTED, PAYMENT_COMPLETED, etc.)
 * - {{trigger.form.name}} - Form name (FORM_SUBMITTED)
 * - {{trigger.transaction.amount}} - Payment amount (PAYMENT_COMPLETED)
 * - {{trigger.ticket.stageName}} - Pipeline stage (PIPELINE_TICKET_MOVED)
 * - {{trigger.appointment.title}} - Appointment title (APPOINTMENT_SCHEDULED/STARTED)
 *
 * SOURCE OF TRUTH KEYWORDS: TriggerVariableContext, AutomationTriggerVariables
 */
export interface TriggerVariableContext {
  /** The trigger type that started this automation */
  type: string

  /** Form submission trigger data (FORM_SUBMITTED) */
  form?: {
    id: string
    name: string
  }

  /** Submission data from form (FORM_SUBMITTED) */
  submissionData?: Record<string, string | number | boolean | string[]>

  /** Transaction trigger data (PAYMENT_COMPLETED) */
  transaction?: {
    id: string
    /** Per-item amount in cents (SOURCE OF TRUTH: PerItemTriggerAmount) */
    amount: number
    /** Per-item amount formatted (e.g., "$29.00") */
    amountFormatted: string
    /** Total checkout amount in cents — full Stripe charge for all items (SOURCE OF TRUTH: CheckoutTotalTriggerAmount) */
    checkoutTotal: number
    /** Total checkout amount formatted (e.g., "$99.00") */
    checkoutTotalFormatted: string
    currency: string
    paymentLinkId: string
  }

  /** Pipeline ticket trigger data (PIPELINE_TICKET_MOVED) */
  ticket?: {
    id: string
    pipelineId: string
    fromStageId: string
    fromStageName: string
    toStageId: string
    toStageName: string
  }

  /** Appointment trigger data (APPOINTMENT_SCHEDULED, APPOINTMENT_STARTED) */
  appointment?: {
    id: string
    calendarId: string
    title: string
    startDate: string
    endDate: string
  }

  /** Trial subscription data — populated by TRIAL_STARTED trigger */
  trial?: {
    productName: string
    priceName: string
    trialDays: number
    trialEndsAt: string
  }

  /** Subscription renewal data — populated by SUBSCRIPTION_RENEWED trigger */
  subscription?: {
    amount: number
    amountFormatted: string
    currency: string
    productName: string
    priceName: string
    paymentNumber: number
  }

  /** Cancellation data — populated by SUBSCRIPTION_CANCELLED trigger */
  cancellation?: {
    productName: string
    priceName: string
    reason: string
  }
}

/**
 * Empty trigger context for when no trigger data available.
 */
export const EMPTY_TRIGGER: TriggerVariableContext = {
  type: '',
}

// ============================================================================
// COMPLETE VARIABLE CONTEXT
// ============================================================================

/**
 * Complete variable context for template interpolation.
 *
 * This is the root object passed to the interpolate function.
 * All data is pre-processed with smart defaults (empty strings for null/undefined).
 *
 * Access patterns:
 * - {{lead.firstName}}
 * - {{lead.customData.preferredContact}}
 * - {{lead.transaction.paidAmountFormatted}}
 * - {{organization.name}}
 * - {{now.date}}
 * - {{submission.data.message}} - Only when in submission context
 * - {{trigger.form.name}} - Only in automation context
 * - {{trigger.transaction.amount}} - Only in automation context
 */
export interface VariableContext {
  /** Lead data and related entities */
  lead: LeadVariableContext

  /** Organization context */
  organization: OrganizationVariableContext

  /** Current date/time utilities */
  now: NowVariableContext

  /**
   * Current submission context (optional).
   * Only present when the context is triggered by a form submission.
   * Provides direct access to submission data.
   */
  submission?: SubmissionVariableContext

  /**
   * Trigger context (optional).
   * Only present in automation execution context.
   * Provides access to trigger-specific data like form, tag, transaction, etc.
   *
   * SOURCE OF TRUTH KEYWORDS: AutomationTriggerContext
   */
  trigger?: TriggerVariableContext
}

// ============================================================================
// CONTEXT BUILDER OPTIONS
// ============================================================================

/**
 * Options for building variable context.
 */
export interface VariableContextOptions {
  /** Include transaction history (default: true for latest, false for all) */
  includeTransactions?: boolean
  /** Include all transactions, not just latest (default: false) */
  includeAllTransactions?: boolean
  /** Include submission history (default: true for latest, false for all) */
  includeSubmissions?: boolean
  /** Include all submissions, not just latest (default: false) */
  includeAllSubmissions?: boolean
  /** Specific submission ID to include as current context */
  currentSubmissionId?: string
  /**
   * When true, return safe empty defaults for ALL missing data instead of throwing.
   * Used by automation execution where data may be missing or deleted between
   * trigger fire and task execution (e.g., lead deleted, org removed).
   * Any future data source added to the context builder should follow this pattern:
   * if missing and gracefulDefaults is true, return the EMPTY_X constant.
   * SOURCE OF TRUTH KEYWORDS: GracefulDefaults, AutomationSafeMode
   */
  gracefulDefaults?: boolean
  /**
   * Trigger data for automation context.
   * When provided, builds the trigger variable context.
   * SOURCE OF TRUTH KEYWORDS: AutomationTriggerOptions
   */
  triggerData?: TriggerContextInput
}

/**
 * Input for building trigger variable context.
 * Maps to the trigger data stored in AutomationRun.triggerData.
 * SOURCE OF TRUTH KEYWORDS: TriggerContextInput, AutomationTriggerInput
 */
export interface TriggerContextInput {
  /** The trigger type */
  type: string
  /** Form data (FORM_SUBMITTED) */
  formId?: string
  formName?: string
  submissionId?: string
  submissionData?: Record<string, unknown>
  /** Transaction data (PAYMENT_COMPLETED) */
  transactionId?: string
  /** Per-item amount in cents (SOURCE OF TRUTH: PerItemTriggerAmount) */
  amount?: number
  /** Total checkout amount in cents — full Stripe charge for all items (SOURCE OF TRUTH: CheckoutTotalTriggerAmount) */
  checkoutTotal?: number
  currency?: string
  paymentLinkId?: string
  /** Pipeline data (PIPELINE_TICKET_MOVED) */
  ticketId?: string
  pipelineId?: string
  fromStageId?: string
  fromStageName?: string
  toStageId?: string
  toStageName?: string
  /** Appointment data (APPOINTMENT_SCHEDULED, APPOINTMENT_STARTED) */
  appointmentId?: string
  calendarId?: string
  appointmentTitle?: string
  startDate?: Date | string
  endDate?: Date | string
  /** Shared product info (TRIAL_STARTED, SUBSCRIPTION_RENEWED, SUBSCRIPTION_CANCELLED) */
  productId?: string
  productName?: string
  priceId?: string
  priceName?: string
  /** Trial data (TRIAL_STARTED) */
  trialDays?: number
  trialEndsAt?: Date | string
  /** Subscription renewal data (SUBSCRIPTION_RENEWED) */
  paymentNumber?: number
  /** Cancellation data (SUBSCRIPTION_CANCELLED) */
  cancelReason?: string
}

// ============================================================================
// EMPTY DEFAULTS
// ============================================================================

/**
 * Empty transaction context for when no transactions exist.
 * All values are safe defaults (empty strings, zeros).
 */
export const EMPTY_TRANSACTION: TransactionVariableContext = {
  id: '',
  originalAmount: 0,
  paidAmount: 0,
  refundedAmount: 0,
  currency: 'usd',
  originalAmountFormatted: '$0.00',
  paidAmountFormatted: '$0.00',
  refundedAmountFormatted: '$0.00',
  paymentStatus: '',
  billingType: '',
  totalPayments: 0,
  successfulPayments: 0,
  createdAt: '',
  firstPaidAt: '',
  lastPaidAt: '',
}

/**
 * Empty submission context for when no submissions exist.
 */
export const EMPTY_SUBMISSION: SubmissionVariableContext = {
  id: '',
  formId: '',
  formName: '',
  submittedAt: '',
  data: {},
}

/**
 * Empty lead context for when no lead is attached (e.g., automation triggered
 * without a lead). All fields set to safe defaults so templates render without errors.
 * SOURCE OF TRUTH KEYWORDS: EmptyLead, MissingLeadDefaults
 */
export const EMPTY_LEAD: LeadVariableContext = {
  id: '',
  firstName: '',
  lastName: '',
  fullName: 'Unknown',
  email: '',
  phone: '',
  address: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  status: 'LEAD',
  source: '',
  cltv: 0,
  cltvFormatted: '$0.00',
  location: '',
  locationCode: '',
  createdAt: '',
  updatedAt: '',
  lastActivityAt: '',
  customData: {},
  tags: [],
  transaction: EMPTY_TRANSACTION,
  transactions: [],
  submission: EMPTY_SUBMISSION,
  submissions: [],
}

/**
 * Empty organization context.
 */
export const EMPTY_ORGANIZATION: OrganizationVariableContext = {
  id: '',
  name: '',
  slug: '',
  logo: '',
  customDomain: '',
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Valid formatters for the interpolation function.
 */
export type VariableFormatter =
  | 'currency'
  | 'date'
  | 'datetime'
  | 'time'
  | 'uppercase'
  | 'lowercase'
  | 'capitalize'
  | 'number'
  | 'percent'

/**
 * Result of parsing a variable expression.
 */
export interface ParsedVariable {
  /** Full path (e.g., "lead.firstName") */
  path: string
  /** Path segments (e.g., ["lead", "firstName"]) */
  segments: string[]
  /** Optional formatter (e.g., "currency") */
  formatter?: VariableFormatter
  /** Optional default value (e.g., "'N/A'") */
  defaultValue?: string
}
