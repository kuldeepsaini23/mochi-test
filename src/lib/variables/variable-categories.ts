/**
 * ============================================================================
 * VARIABLE CATEGORIES (SINGLE SOURCE OF TRUTH)
 * ============================================================================
 *
 * Defines all variable categories and their variables used across
 * the application — consumed by the global VariablePicker component
 * at @/components/global/variable-picker.tsx.
 *
 * WHY: Centralizing variable definitions prevents duplication.
 * Adding a new variable here automatically makes it available
 * everywhere without updating multiple files.
 *
 * STRUCTURE:
 * - Shared categories (Lead, Organization, Transaction, Date/Time)
 *   are always available regardless of context.
 * - Trigger-specific categories (Form Data, Pipeline Ticket, Payment, Appointment)
 *   are only shown when the relevant trigger type is active.
 * - TRIGGER_CATEGORY_MAP maps each trigger type to its available categories.
 *
 * SOURCE OF TRUTH KEYWORDS: VariableCategories, VariableCategoryDefinitions,
 * AutomationVariableCategories, TriggerVariableMap
 */

import type { LucideIcon } from 'lucide-react'
import {
  User,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Kanban,
  DollarSign,
  Clock,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import type { AutomationTriggerType } from '@/components/automation-builder/_lib/types'

// ============================================================================
// TYPES
// ============================================================================

export interface VariableOption {
  /** The variable key used in templates (e.g., 'lead.email') */
  key: string
  /** Human-readable label shown in the picker UI */
  label: string
}

export interface VariableCategory {
  /** Unique category identifier */
  id: string
  /** Display label in the picker */
  label: string
  /** Lucide icon component for the category */
  icon: LucideIcon
  /** List of variables in this category */
  variables: VariableOption[]
}

// ============================================================================
// SHARED CATEGORIES
// Always available in both email-builder and automation-builder.
// SOURCE OF TRUTH: Matches VariableContext from @/lib/variables/types.ts
// ============================================================================

export const LEAD_CATEGORY: VariableCategory = {
  id: 'lead',
  label: 'Lead',
  icon: User,
  variables: [
    { key: 'lead.firstName', label: 'First Name' },
    { key: 'lead.lastName', label: 'Last Name' },
    { key: 'lead.fullName', label: 'Full Name' },
    { key: 'lead.email', label: 'Email' },
    { key: 'lead.phone', label: 'Phone' },
    { key: 'lead.address', label: 'Address' },
    { key: 'lead.city', label: 'City' },
    { key: 'lead.state', label: 'State' },
    { key: 'lead.zipCode', label: 'Zip Code' },
    { key: 'lead.country', label: 'Country' },
    { key: 'lead.status', label: 'Status' },
    { key: 'lead.source', label: 'Source' },
    { key: 'lead.cltvFormatted', label: 'Lifetime Value' },
  ],
}

export const ORGANIZATION_CATEGORY: VariableCategory = {
  id: 'organization',
  label: 'Organization',
  icon: Building2,
  variables: [
    { key: 'organization.name', label: 'Name' },
    { key: 'organization.logo', label: 'Logo URL' },
    { key: 'organization.customDomain', label: 'Custom Domain' },
  ],
}

export const TRANSACTION_CATEGORY: VariableCategory = {
  id: 'transaction',
  label: 'Transaction',
  icon: CreditCard,
  variables: [
    { key: 'lead.transaction.paidAmountFormatted', label: 'Paid Amount' },
    { key: 'lead.transaction.originalAmountFormatted', label: 'Original Amount' },
    { key: 'lead.transaction.currency', label: 'Currency' },
    { key: 'lead.transaction.paymentStatus', label: 'Payment Status' },
    { key: 'lead.transaction.billingType', label: 'Billing Type' },
  ],
}

export const DATETIME_CATEGORY: VariableCategory = {
  id: 'datetime',
  label: 'Date/Time',
  icon: Calendar,
  variables: [
    { key: 'now.date', label: 'Current Date' },
    { key: 'now.year', label: 'Current Year' },
    { key: 'now.month', label: 'Current Month' },
    { key: 'now.day', label: 'Current Day' },
    { key: 'now.datetime', label: 'Current Date/Time' },
  ],
}

/**
 * All shared categories that are always available.
 * Used by the email-builder VariablePicker as its full list,
 * and as the base for every trigger type in the automation-builder.
 */
export const SHARED_CATEGORIES: VariableCategory[] = [
  LEAD_CATEGORY,
  ORGANIZATION_CATEGORY,
  TRANSACTION_CATEGORY,
  DATETIME_CATEGORY,
]

// ============================================================================
// TRIGGER-SPECIFIC CATEGORIES
// Only shown when the matching trigger type is active in the automation builder.
// ============================================================================

export const FORM_DATA_CATEGORY: VariableCategory = {
  id: 'formData',
  label: 'Form Data',
  icon: FileText,
  variables: [
    { key: 'trigger.form.name', label: 'Form Name' },
    { key: 'trigger.form.id', label: 'Form ID' },
    { key: 'trigger.submissionData.email', label: 'Submitted Email' },
    { key: 'trigger.submissionData.name', label: 'Submitted Name' },
    { key: 'trigger.submissionData.phone', label: 'Submitted Phone' },
    { key: 'trigger.submissionData.message', label: 'Submitted Message' },
  ],
}

export const PIPELINE_TICKET_CATEGORY: VariableCategory = {
  id: 'pipelineTicket',
  label: 'Pipeline Ticket',
  icon: Kanban,
  variables: [
    { key: 'trigger.ticket.id', label: 'Ticket ID' },
    { key: 'trigger.ticket.title', label: 'Ticket Title' },
    { key: 'trigger.ticket.value', label: 'Ticket Value' },
    { key: 'trigger.fromLane.name', label: 'From Stage' },
    { key: 'trigger.toLane.name', label: 'To Stage' },
    { key: 'trigger.pipeline.name', label: 'Pipeline Name' },
  ],
}

export const PAYMENT_CATEGORY: VariableCategory = {
  id: 'payment',
  label: 'Payment',
  icon: DollarSign,
  variables: [
    { key: 'trigger.payment.amount', label: 'Item Amount' },
    { key: 'trigger.payment.checkoutTotal', label: 'Checkout Total' },
    { key: 'trigger.payment.currency', label: 'Currency' },
    { key: 'trigger.payment.id', label: 'Transaction ID' },
    { key: 'trigger.payment.productName', label: 'Product Name' },
    { key: 'trigger.payment.priceName', label: 'Price/Plan Name' },
    { key: 'trigger.payment.billingType', label: 'Billing Type' },
  ],
}

export const APPOINTMENT_CATEGORY: VariableCategory = {
  id: 'appointment',
  label: 'Appointment',
  icon: Clock,
  variables: [
    { key: 'trigger.appointment.title', label: 'Appointment Title' },
    { key: 'trigger.appointment.startTime', label: 'Start Time' },
    { key: 'trigger.appointment.endTime', label: 'End Time' },
    { key: 'trigger.calendar.name', label: 'Calendar Name' },
    { key: 'trigger.calendar.id', label: 'Calendar ID' },
  ],
}

/**
 * Trial trigger variables — available when automation is triggered by TRIAL_STARTED.
 * Provides product info and trial duration details for personalized trial emails.
 * SOURCE OF TRUTH KEYWORDS: TrialVariableCategory
 */
export const TRIAL_CATEGORY: VariableCategory = {
  id: 'trial',
  label: 'Trial',
  icon: Clock,
  variables: [
    { key: 'trigger.trial.productName', label: 'Product Name' },
    { key: 'trigger.trial.priceName', label: 'Price/Plan Name' },
    { key: 'trigger.trial.trialDays', label: 'Trial Duration (days)' },
    { key: 'trigger.trial.trialEndsAt', label: 'Trial End Date' },
  ],
}

/**
 * Subscription renewal trigger variables — available when automation is triggered by SUBSCRIPTION_RENEWED.
 * Provides payment amount, product info, and renewal count for recurring billing notifications.
 * SOURCE OF TRUTH KEYWORDS: SubscriptionRenewalVariableCategory
 */
export const SUBSCRIPTION_CATEGORY: VariableCategory = {
  id: 'subscription',
  label: 'Subscription',
  icon: RefreshCw,
  variables: [
    { key: 'trigger.subscription.amount', label: 'Payment Amount' },
    { key: 'trigger.subscription.currency', label: 'Currency' },
    { key: 'trigger.subscription.productName', label: 'Product Name' },
    { key: 'trigger.subscription.priceName', label: 'Price/Plan Name' },
    { key: 'trigger.subscription.paymentNumber', label: 'Payment Number' },
  ],
}

/**
 * Cancellation trigger variables — available when automation is triggered by SUBSCRIPTION_CANCELLED.
 * Provides product info and cancellation reason for win-back or feedback automations.
 * SOURCE OF TRUTH KEYWORDS: CancellationVariableCategory
 */
export const CANCELLATION_CATEGORY: VariableCategory = {
  id: 'cancellation',
  label: 'Cancellation',
  icon: XCircle,
  variables: [
    { key: 'trigger.cancellation.productName', label: 'Product Name' },
    { key: 'trigger.cancellation.priceName', label: 'Price/Plan Name' },
    { key: 'trigger.cancellation.reason', label: 'Cancellation Reason' },
  ],
}

// ============================================================================
// TRIGGER TYPE -> CATEGORIES MAPPING
// Maps each trigger type to the full list of variable categories available
// in that context. Shared categories are included in every mapping.
// ============================================================================

export const TRIGGER_CATEGORY_MAP: Record<AutomationTriggerType, VariableCategory[]> = {
  form_submitted: [LEAD_CATEGORY, FORM_DATA_CATEGORY, ORGANIZATION_CATEGORY, TRANSACTION_CATEGORY, DATETIME_CATEGORY],
  pipeline_ticket_moved: [LEAD_CATEGORY, PIPELINE_TICKET_CATEGORY, ORGANIZATION_CATEGORY, TRANSACTION_CATEGORY, DATETIME_CATEGORY],
  payment_completed: [LEAD_CATEGORY, PAYMENT_CATEGORY, ORGANIZATION_CATEGORY, TRANSACTION_CATEGORY, DATETIME_CATEGORY],
  appointment_scheduled: [LEAD_CATEGORY, APPOINTMENT_CATEGORY, ORGANIZATION_CATEGORY, TRANSACTION_CATEGORY, DATETIME_CATEGORY],
  appointment_started: [LEAD_CATEGORY, APPOINTMENT_CATEGORY, ORGANIZATION_CATEGORY, TRANSACTION_CATEGORY, DATETIME_CATEGORY],
  trial_started: [LEAD_CATEGORY, TRIAL_CATEGORY, ORGANIZATION_CATEGORY, DATETIME_CATEGORY],
  subscription_renewed: [LEAD_CATEGORY, SUBSCRIPTION_CATEGORY, ORGANIZATION_CATEGORY, DATETIME_CATEGORY],
  subscription_cancelled: [LEAD_CATEGORY, CANCELLATION_CATEGORY, ORGANIZATION_CATEGORY, DATETIME_CATEGORY],
}
