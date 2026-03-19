/**
 * Sample Variable Context
 *
 * Provides mock/sample data for client-side variable interpolation preview.
 * This allows showing realistic previews without database access.
 *
 * Use cases:
 * - Email builder preview mode
 * - Template editor previews
 * - Automation builder previews
 *
 * SOURCE OF TRUTH KEYWORDS: SampleVariableContext, MockVariableContext, PreviewContext
 */

import type {
  VariableContext,
  LeadVariableContext,
  OrganizationVariableContext,
  NowVariableContext,
  TransactionVariableContext,
  SubmissionVariableContext,
} from './types'

// ============================================================================
// SAMPLE DATA - Realistic mock values for previews
// ============================================================================

/**
 * Sample transaction for preview purposes.
 * Shows what a typical completed transaction looks like.
 */
const SAMPLE_TRANSACTION: TransactionVariableContext = {
  id: 'txn_sample_001',
  originalAmount: 9900,
  paidAmount: 9900,
  refundedAmount: 0,
  currency: 'usd',
  originalAmountFormatted: '$99.00',
  paidAmountFormatted: '$99.00',
  refundedAmountFormatted: '$0.00',
  paymentStatus: 'paid',
  billingType: 'one-time',
  totalPayments: 1,
  successfulPayments: 1,
  createdAt: new Date().toISOString(),
  firstPaidAt: new Date().toISOString(),
  lastPaidAt: new Date().toISOString(),
}

/**
 * Sample submission for preview purposes.
 */
const SAMPLE_SUBMISSION: SubmissionVariableContext = {
  id: 'sub_sample_001',
  formId: 'form_sample_001',
  formName: 'Contact Form',
  submittedAt: new Date().toISOString(),
  data: {
    message: 'I would like to learn more about your services.',
    preferredContact: 'email',
  },
}

/**
 * Sample lead for preview purposes.
 * Shows realistic customer data for email/template previews.
 */
const SAMPLE_LEAD: LeadVariableContext = {
  id: 'lead_sample_001',
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  email: 'john.doe@example.com',
  phone: '+1 (555) 123-4567',
  address: '123 Main Street',
  address2: 'Suite 100',
  city: 'San Francisco',
  state: 'California',
  zipCode: '94102',
  country: 'United States',
  status: 'ACTIVE',
  source: 'website',
  cltv: 1250,
  cltvFormatted: '$1,250.00',
  location: 'SF Bay Area',
  locationCode: 'US-CA-SF',
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
  updatedAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  customData: {
    // Sample custom data fields - will be overridden if actual fields exist
    preferredLanguage: 'English',
    referralSource: 'Google',
    accountType: 'Premium',
  },
  tags: ['VIP', 'Newsletter'],
  transaction: SAMPLE_TRANSACTION,
  transactions: [SAMPLE_TRANSACTION],
  submission: SAMPLE_SUBMISSION,
  submissions: [SAMPLE_SUBMISSION],
}

/**
 * Sample organization for preview purposes.
 */
const SAMPLE_ORGANIZATION: OrganizationVariableContext = {
  id: 'org_sample_001',
  name: 'Acme Inc.',
  slug: 'acme-inc',
  logo: 'https://placehold.co/200x50/2563eb/ffffff?text=ACME',
  customDomain: 'app.acme-inc.com',
}

/**
 * Build sample "now" context with current date/time.
 */
function buildSampleNowContext(): NowVariableContext {
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
// MAIN EXPORT
// ============================================================================

/**
 * Get a sample variable context for client-side preview.
 *
 * This provides realistic mock data that can be used to preview
 * templates without needing database access.
 *
 * @param customDataOverrides - Optional custom data field overrides
 * @returns Sample VariableContext ready for interpolation
 *
 * @example
 * import { getSampleVariableContext } from '@/lib/variables/sample-context'
 * import { interpolate } from '@/lib/variables'
 *
 * const sampleContext = getSampleVariableContext()
 * const preview = interpolate('Hello {{lead.firstName}}!', sampleContext)
 * // => 'Hello John!'
 */
export function getSampleVariableContext(
  customDataOverrides?: Record<string, string | number | boolean | string[]>
): VariableContext {
  return {
    lead: {
      ...SAMPLE_LEAD,
      customData: {
        ...SAMPLE_LEAD.customData,
        ...customDataOverrides,
      },
    },
    organization: SAMPLE_ORGANIZATION,
    now: buildSampleNowContext(),
    submission: SAMPLE_SUBMISSION,
  }
}

/**
 * Get individual sample components for more granular control.
 */
export const sampleData = {
  lead: SAMPLE_LEAD,
  organization: SAMPLE_ORGANIZATION,
  transaction: SAMPLE_TRANSACTION,
  submission: SAMPLE_SUBMISSION,
}

/**
 * Build a VariableContext from a LeadOption (minimal lead data).
 *
 * This allows preview mode to use real lead data from the selected test lead.
 * Since LeadOption only has basic info, we fill in the rest with sample data.
 *
 * @param lead - LeadOption with id, firstName, lastName, email, phone, avatarUrl
 * @param organizationName - Optional organization name for context
 * @returns VariableContext ready for interpolation
 *
 * SOURCE OF TRUTH KEYWORDS: buildContextFromLeadOption, TestLeadContext
 */
export function buildContextFromLeadOption(
  lead: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    avatarUrl: string | null
  },
  organizationName?: string
): VariableContext {
  const firstName = lead.firstName ?? ''
  const lastName = lead.lastName ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || lead.email.split('@')[0]

  return {
    lead: {
      id: lead.id,
      firstName,
      lastName,
      fullName,
      email: lead.email,
      phone: lead.phone ?? '',
      // Use sample values for fields not in LeadOption
      address: SAMPLE_LEAD.address,
      address2: SAMPLE_LEAD.address2,
      city: SAMPLE_LEAD.city,
      state: SAMPLE_LEAD.state,
      zipCode: SAMPLE_LEAD.zipCode,
      country: SAMPLE_LEAD.country,
      status: SAMPLE_LEAD.status,
      source: SAMPLE_LEAD.source,
      cltv: SAMPLE_LEAD.cltv,
      cltvFormatted: SAMPLE_LEAD.cltvFormatted,
      location: SAMPLE_LEAD.location,
      locationCode: SAMPLE_LEAD.locationCode,
      createdAt: SAMPLE_LEAD.createdAt,
      updatedAt: SAMPLE_LEAD.updatedAt,
      lastActivityAt: SAMPLE_LEAD.lastActivityAt,
      customData: SAMPLE_LEAD.customData,
      tags: SAMPLE_LEAD.tags,
      transaction: SAMPLE_TRANSACTION,
      transactions: [SAMPLE_TRANSACTION],
      submission: SAMPLE_SUBMISSION,
      submissions: [SAMPLE_SUBMISSION],
    },
    organization: organizationName
      ? { ...SAMPLE_ORGANIZATION, name: organizationName }
      : SAMPLE_ORGANIZATION,
    now: buildSampleNowContext(),
    submission: SAMPLE_SUBMISSION,
  }
}

/**
 * Check if a value looks like a variable placeholder.
 * Useful for detecting unresolved variables in preview.
 *
 * @param value - Value to check
 * @returns True if value is a variable placeholder
 */
export function isVariablePlaceholder(value: string): boolean {
  return /^\{\{[^}]+\}\}$/.test(value)
}

/**
 * Extract all variable placeholders from text.
 * Useful for highlighting unresolved variables.
 *
 * @param text - Text to scan
 * @returns Array of variable placeholders found
 */
export function extractVariablePlaceholders(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g)
  return matches ?? []
}
