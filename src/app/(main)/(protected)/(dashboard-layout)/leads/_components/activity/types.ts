/**
 * Lead Activity Timeline Types
 *
 * SOURCE OF TRUTH KEYWORDS: LeadActivity, LeadActivityItem, ActivityTimeline, LeadActivityType
 *
 * WHY: Discriminated union type for all lead activity items displayed in the
 * Activity tab of the Lead Viewer. Each activity type carries its own context
 * data sourced directly from the relevant database model.
 *
 * HOW: Uses Prisma enums directly as source of truth for status/channel values.
 * The discriminated union on `type` field enables exhaustive type narrowing
 * in switch statements throughout the UI layer.
 */

import type {
  MessageChannel,
  ContractStatus,
  InvoiceStatus,
  CalendarEventStatus,
  TransactionPaymentStatus,
  BillingType,
} from '@/generated/prisma'

// ============================================================================
// ACTIVITY TYPE ENUM
// ============================================================================

/**
 * All possible activity types that appear in the lead timeline.
 * Each maps 1:1 to an existing database model or event.
 */
export type LeadActivityType =
  | 'LEAD_CREATED'
  | 'FORM_SUBMITTED'
  | 'PAYMENT_MADE'
  | 'APPOINTMENT_BOOKED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'CONTRACT_SENT'
  | 'CONTRACT_SIGNED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID'
  | 'PIPELINE_TICKET_CREATED'
  | 'TAG_ADDED'
  | 'SESSION_STARTED'
  | 'PAGE_VISITED'

// ============================================================================
// BASE ACTIVITY INTERFACE
// ============================================================================

/**
 * Base shape shared by all activity items.
 * Every activity has a unique ID, a type discriminator, and a timestamp.
 */
interface BaseActivity {
  /** Unique identifier using format "{sourceModel}_{sourceRecordId}" to avoid collisions across tables */
  id: string
  /** When this activity occurred (ISO string from the source model's relevant timestamp) */
  timestamp: string
}

// ============================================================================
// INDIVIDUAL ACTIVITY TYPES
// ============================================================================

/** Lead was created in the system — sourced from Lead.createdAt */
export interface LeadCreatedActivity extends BaseActivity {
  type: 'LEAD_CREATED'
}

/** Lead submitted a form — sourced from FormSubmission */
export interface FormSubmittedActivity extends BaseActivity {
  type: 'FORM_SUBMITTED'
  formName: string
  formId: string
}

/** Payment was made by the lead — sourced from Transaction + TransactionItem[] */
export interface PaymentMadeActivity extends BaseActivity {
  type: 'PAYMENT_MADE'
  /** Total amount in cents */
  amount: number
  currency: string
  paymentStatus: TransactionPaymentStatus
  billingType: BillingType
  /** First item's product name for display, or "Multiple items" if more than one */
  productSummary: string
  /** Number of items in the transaction */
  itemCount: number
}

/** Appointment was booked — sourced from CalendarEvent (linked via leadId) */
export interface AppointmentBookedActivity extends BaseActivity {
  type: 'APPOINTMENT_BOOKED'
  title: string
  status: CalendarEventStatus
  startDate: string
  endDate: string
  location: string | null
  meetingUrl: string | null
}

/** Outbound message was sent to the lead — sourced from Message (direction=OUTBOUND) */
export interface MessageSentActivity extends BaseActivity {
  type: 'MESSAGE_SENT'
  channel: MessageChannel
  subject: string | null
  /** Truncated plain-text preview of the message body */
  bodyPreview: string
}

/** Inbound message was received from the lead — sourced from Message (direction=INBOUND) */
export interface MessageReceivedActivity extends BaseActivity {
  type: 'MESSAGE_RECEIVED'
  channel: MessageChannel
  subject: string | null
  /** Truncated plain-text preview of the message body */
  bodyPreview: string
}

/** Contract was sent to the lead — sourced from Contract.sentAt */
export interface ContractSentActivity extends BaseActivity {
  type: 'CONTRACT_SENT'
  contractName: string
  contractId: string
  status: ContractStatus
}

/** Contract was signed by the lead — sourced from Contract.signedAt */
export interface ContractSignedActivity extends BaseActivity {
  type: 'CONTRACT_SIGNED'
  contractName: string
  contractId: string
}

/** Invoice was sent to the lead — sourced from Invoice.sentAt */
export interface InvoiceSentActivity extends BaseActivity {
  type: 'INVOICE_SENT'
  invoiceName: string
  invoiceNumber: string
  invoiceId: string
  /** Total amount in cents */
  totalAmount: number
  currency: string
  status: InvoiceStatus
}

/** Invoice was paid by the lead — sourced from Invoice.paidAt */
export interface InvoicePaidActivity extends BaseActivity {
  type: 'INVOICE_PAID'
  invoiceName: string
  invoiceNumber: string
  invoiceId: string
  /** Total amount in cents */
  totalAmount: number
  currency: string
}

/** Lead was added to a pipeline — sourced from PipelineTicket.createdAt */
export interface PipelineTicketCreatedActivity extends BaseActivity {
  type: 'PIPELINE_TICKET_CREATED'
  ticketTitle: string
  laneName: string
  pipelineName: string
  /** Monetary value in dollars if set on the ticket */
  value: number | null
}

/** Tag was applied to the lead — sourced from LeadTagAssignment.createdAt */
export interface TagAddedActivity extends BaseActivity {
  type: 'TAG_ADDED'
  tagName: string
  tagColor: string
}

/** Lead session started (visitor identified) — sourced from LeadSession.createdAt */
export interface SessionStartedActivity extends BaseActivity {
  type: 'SESSION_STARTED'
  /** How the session originated: 'form', 'chatbot', 'website', etc. */
  source: string | null
}

/** Lead visited a published website page — sourced from PageView.visitedAt */
export interface PageVisitedActivity extends BaseActivity {
  type: 'PAGE_VISITED'
  /** URL path that was visited (e.g., "/home", "/about") */
  pathname: string
  /** Name of the page for display */
  pageName: string
  /** UTM source if present */
  utmSource: string | null
}

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

/**
 * Discriminated union of all activity types.
 * Use `item.type` to narrow the type and access type-specific fields.
 *
 * Example:
 * ```ts
 * switch (item.type) {
 *   case 'FORM_SUBMITTED':
 *     console.log(item.formName) // TS knows formName exists
 *     break
 *   case 'PAYMENT_MADE':
 *     console.log(item.amount)   // TS knows amount exists
 *     break
 * }
 * ```
 */
export type LeadActivityItem =
  | LeadCreatedActivity
  | FormSubmittedActivity
  | PaymentMadeActivity
  | AppointmentBookedActivity
  | MessageSentActivity
  | MessageReceivedActivity
  | ContractSentActivity
  | ContractSignedActivity
  | InvoiceSentActivity
  | InvoicePaidActivity
  | PipelineTicketCreatedActivity
  | TagAddedActivity
  | SessionStartedActivity
  | PageVisitedActivity

// ============================================================================
// RESPONSE TYPE
// ============================================================================

/**
 * Response shape for the leads.getActivity tRPC procedure.
 * Uses page-based pagination since we're merging items across 10+ heterogeneous tables.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadActivityResponse, ActivityPagination
 */
export interface LeadActivityResponse {
  /** Activity items for the current page, sorted newest-first */
  items: LeadActivityItem[]
  /** Current page number (1-indexed) */
  page: number
  /** Number of items per page */
  pageSize: number
  /** Whether there are more pages available after this one */
  hasMore: boolean
  /** Approximate total count (sum of items across all source models) */
  totalEstimate: number
}
