/**
 * Invoice Service
 *
 * Data Access Layer (DAL) for invoices.
 * Handles CRUD operations for billable invoice documents sent to leads,
 * including line items, public access links, and payment status tracking.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceService, InvoiceDAL, InvoiceCRUD
 *
 * ARCHITECTURE:
 * - Invoices stored in database with JSON notes (Lexical SerializedEditorState)
 * - Line items (InvoiceItem) support both product-linked and ad-hoc entries
 * - Public access via unique accessToken (generated on send)
 * - Invoice numbers auto-increment per organization (INV-0001, INV-0002, etc.)
 * - HARD DELETE only (no soft delete)
 */

import { prisma } from '@/lib/config'
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  BillingType,
  BillingInterval,
} from '@/generated/prisma'
import { nanoid } from 'nanoid'
import { createTransaction } from '@/services/transaction.service'
import {
  completeTransaction,
} from '@/services/payment/payment-completion.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Invoice with its line items and lead relation included.
 * The lead select is scoped to the fields needed for display
 * (name, email, phone, avatar) — no internal-only fields leaked.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceWithItems, InvoiceFullView
 */
export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[]
  lead: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    avatarUrl: string | null
  } | null
}

/**
 * Paginated result for listing invoices.
 *
 * SOURCE OF TRUTH KEYWORDS: ListInvoicesResult
 */
export interface ListInvoicesResult {
  invoices: InvoiceWithItems[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * Filters for listing invoices — supports search, status, and pagination.
 *
 * SOURCE OF TRUTH KEYWORDS: ListInvoicesInput
 */
export interface ListInvoicesInput {
  organizationId: string
  search?: string
  status?: InvoiceStatus
  page?: number
  limit?: number
}

/**
 * Input for creating a new invoice.
 * Items are optional — they can be added later via syncInvoiceItems.
 *
 * SOURCE OF TRUTH KEYWORDS: CreateInvoiceInput
 */
export interface CreateInvoiceInput {
  organizationId: string
  name: string
  leadId?: string | null
  dueDate?: Date | null
  currency?: string
  items?: InvoiceItemInput[]
}

/**
 * Input for updating an existing invoice's metadata.
 * Only includes fields that can be changed after creation.
 * Content (items) is managed separately via syncInvoiceItems.
 *
 * SOURCE OF TRUTH KEYWORDS: UpdateInvoiceInput
 */
export interface UpdateInvoiceInput {
  name?: string
  notes?: object | null
  dueDate?: Date | null
  currency?: string
  leadId?: string | null
}

/**
 * Input for a single invoice line item.
 * Used by both createInvoice (initial items) and syncInvoiceItems (replace all).
 *
 * productId/priceId are null for ad-hoc items (isAdHoc: true).
 * billingType defaults to ONE_TIME — most invoice items are one-time charges.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceItemInput
 */
export interface InvoiceItemInput {
  productId?: string | null
  priceId?: string | null
  name: string
  description?: string | null
  quantity: number
  unitAmount: number
  billingType?: BillingType
  interval?: BillingInterval | null
  intervalCount?: number | null
  /**
   * Free trial period in days. When > 0, the invoice payment creates a
   * trialing subscription (SetupIntent) instead of charging immediately.
   * SOURCE OF TRUTH: InvoiceItemTrialDays
   */
  trialDays?: number | null
  isAdHoc?: boolean
}

/**
 * Sanitized public data for the invoice public view page.
 * Exposes ONLY what the recipient needs to see — no internal IDs,
 * no organizationId, no stripePaymentIntentId, etc.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicePublicData, InvoicePublicView
 */
export interface InvoicePublicData {
  id: string
  invoiceNumber: string
  name: string
  status: InvoiceStatus
  notes: object | null
  dueDate: Date | null
  currency: string
  totalAmount: number
  sentAt: Date | null
  paidAt: Date | null
  createdAt: Date
  items: Array<{
    name: string
    description: string | null
    quantity: number
    unitAmount: number
    totalAmount: number
    billingType: BillingType
    interval: BillingInterval | null
    intervalCount: number | null
    /** SOURCE OF TRUTH: InvoiceItemTrialDays */
    trialDays: number | null
  }>
  organization: {
    name: string
    logo: string | null
    rectangleLogo: string | null
    /** Stripe Connect account ID — needed on the frontend to init Stripe.js */
    stripeConnectedAccountId: string | null
    /** Physical/mailing address displayed on the invoice header */
    address: string | null
    /** Public-facing contact email displayed on the invoice header */
    contactEmail: string | null
  }
  lead: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

// ============================================================================
// SHARED INCLUDES
// ============================================================================

/**
 * Reusable Prisma include clause for InvoiceWithItems queries.
 * WHY: Avoids duplicating the same include block across multiple functions.
 */
const INVOICE_WITH_ITEMS_INCLUDE = {
  items: true,
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatarUrl: true,
    },
  },
} as const

// ============================================================================
// LIST
// ============================================================================

/**
 * List invoices with pagination, search, and status filter.
 *
 * When search is provided, it searches by invoice name across all invoices.
 * Includes lead relation for displaying recipient info in the list view.
 * Ordered by updatedAt descending so the most recently touched invoices appear first.
 *
 * @param input - Pagination, search, and status filters
 * @returns Paginated list of invoices with items and lead relation
 */
export async function listInvoices(
  input: ListInvoicesInput
): Promise<ListInvoicesResult> {
  const { organizationId, page = 1, limit = 20, search, status } = input

  // Build where clause
  // Search mode: filter by name (case-insensitive)
  // Status mode: filter by invoice status
  // Both can be combined
  const where = {
    organizationId,
    ...(status ? { status } : {}),
    ...(search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {}),
  }

  // Fetch invoices and total count in parallel for performance
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: INVOICE_WITH_ITEMS_INCLUDE,
    }),
    prisma.invoice.count({ where }),
  ])

  return {
    invoices,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ============================================================================
// GET BY ID
// ============================================================================

/**
 * Get a single invoice by ID with all items and lead data.
 * Ensures the invoice belongs to the given organization for access control.
 *
 * @param id - Invoice ID
 * @param organizationId - Organization context for access control
 * @returns Invoice with items and lead, or null if not found
 */
export async function getInvoiceById(
  id: string,
  organizationId: string
): Promise<InvoiceWithItems | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId },
    include: INVOICE_WITH_ITEMS_INCLUDE,
  })

  return invoice
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new invoice with DRAFT status.
 *
 * Auto-generates the invoiceNumber via getNextInvoiceNumber (INV-0001 format).
 * If items are provided, creates them inline and calculates totalAmount.
 * If no items, totalAmount defaults to 0 and items can be added via syncInvoiceItems.
 *
 * WHY auto-generate invoiceNumber: Invoice numbers must be unique per org
 * and sequential for accounting compliance. Users shouldn't have to manage this.
 *
 * @param input - Invoice creation input with optional items
 * @returns Created invoice with items and lead relation
 */
export async function createInvoice(
  input: CreateInvoiceInput
): Promise<InvoiceWithItems> {
  const { organizationId, name, leadId, dueDate, currency, items } = input

  /**
   * Resolve the invoice currency:
   * 1. Use the explicitly provided currency if given
   * 2. Fall back to the org's Stripe account currency (SOURCE OF TRUTH)
   * 3. Last resort: 'usd'
   *
   * WHY: Ensures invoices always use the correct org currency even when
   * callers don't explicitly pass it (e.g., Mochi AI tool calls).
   */
  let resolvedCurrency = currency
  if (!resolvedCurrency) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stripeAccountCurrency: true },
    })
    resolvedCurrency = org?.stripeAccountCurrency || 'usd'
  }

  // Generate the next sequential invoice number for this organization
  const invoiceNumber = await getNextInvoiceNumber(organizationId)

  // Calculate totalAmount from items if provided
  // Each item's totalAmount = quantity * unitAmount (in cents)
  const totalAmount = items
    ? items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0)
    : 0

  return await prisma.invoice.create({
    data: {
      organizationId,
      invoiceNumber,
      name,
      leadId: leadId ?? null,
      dueDate: dueDate ?? null,
      currency: resolvedCurrency,
      totalAmount,
      // status defaults to DRAFT via schema default
      ...(items && items.length > 0
        ? {
            items: {
              create: items.map((item) => ({
                name: item.name,
                description: item.description ?? null,
                productId: item.productId ?? null,
                priceId: item.priceId ?? null,
                quantity: item.quantity,
                unitAmount: item.unitAmount,
                totalAmount: item.quantity * item.unitAmount,
                billingType: item.billingType ?? 'ONE_TIME',
                interval: item.interval ?? null,
                intervalCount: item.intervalCount ?? null,
                trialDays: item.trialDays ?? null,
                isAdHoc: item.isAdHoc ?? false,
              })),
            },
          }
        : {}),
    },
    include: INVOICE_WITH_ITEMS_INCLUDE,
  })
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update an existing invoice's metadata (name, notes, dueDate, currency, leadId).
 * Only updates fields that are explicitly provided (undefined fields are skipped).
 *
 * WHY status restriction: Only DRAFT and SENT invoices can be edited.
 * PAID, OVERDUE, and CANCELED invoices are immutable records.
 *
 * @param id - Invoice ID
 * @param organizationId - Organization context for access control
 * @param input - Fields to update
 * @returns Updated invoice with items and lead relation
 * @throws Error if invoice not found or status doesn't allow editing
 */
export async function updateInvoice(
  id: string,
  organizationId: string,
  input: UpdateInvoiceInput
): Promise<InvoiceWithItems> {
  // Verify the invoice exists and belongs to this organization
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Invoice not found: ${id}`)
  }

  // Guard: only DRAFT and SENT invoices can be edited
  if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
    throw new Error(
      `Cannot update invoice with status ${existing.status}. Only DRAFT and SENT invoices can be edited.`
    )
  }

  // Build update payload — only include fields that were explicitly provided
  const updateData: Record<string, string | object | Date | null> = {}
  if (input.name !== undefined) updateData.name = input.name
  if (input.notes !== undefined) updateData.notes = input.notes
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate
  if (input.currency !== undefined) updateData.currency = input.currency
  if (input.leadId !== undefined) updateData.leadId = input.leadId

  return await prisma.invoice.update({
    where: { id },
    data: updateData,
    include: INVOICE_WITH_ITEMS_INCLUDE,
  })
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Permanently delete an invoice (HARD DELETE).
 * Only DRAFT invoices can be deleted — sent/paid invoices are accounting records.
 * InvoiceItems are cascade-deleted by the database relation.
 *
 * WHY status restriction: Deleting a sent or paid invoice would break
 * accounting records and potentially orphan Stripe payment references.
 *
 * @param id - Invoice ID
 * @param organizationId - Organization context for access control
 * @throws Error if invoice not found or not in DRAFT status
 */
export async function deleteInvoice(
  id: string,
  organizationId: string
): Promise<void> {
  // Verify the invoice exists and belongs to this organization
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Invoice not found: ${id}`)
  }

  // Guard: only DRAFT invoices can be deleted
  if (existing.status !== 'DRAFT') {
    throw new Error(
      `Cannot delete invoice with status ${existing.status}. Only DRAFT invoices can be deleted.`
    )
  }

  // InvoiceItems are cascade-deleted by the DB relation (onDelete: Cascade)
  await prisma.invoice.delete({
    where: { id },
  })
}

// ============================================================================
// SEND INVOICE
// ============================================================================

/**
 * Send an invoice to its assigned lead.
 *
 * Generates a unique accessToken (nanoid 32 chars) for the public invoice link,
 * sets the status to SENT, and records the sentAt timestamp.
 * The leadId must already be set on the invoice — invoices without a recipient
 * cannot be sent.
 *
 * WHY separate function: Sending is a distinct action that changes status
 * and generates a secure link. Status should not be manually toggled.
 *
 * SOURCE OF TRUTH KEYWORDS: SendInvoice, InvoiceSend
 *
 * @param id - Invoice ID to send
 * @param organizationId - Organization context for access control
 * @returns Updated invoice + the generated accessToken
 * @throws Error if invoice not found, not DRAFT, or no lead assigned
 */
export async function sendInvoice(
  id: string,
  organizationId: string
): Promise<{ invoice: InvoiceWithItems; accessToken: string }> {
  // Verify the invoice exists and belongs to this organization
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Invoice not found: ${id}`)
  }

  // Guard: only DRAFT invoices can be sent
  if (existing.status !== 'DRAFT') {
    throw new Error('Only DRAFT invoices can be sent')
  }

  // Guard: invoice must have a lead assigned before sending
  if (!existing.leadId) {
    throw new Error(
      'Cannot send invoice without a recipient. Please assign a lead first.'
    )
  }

  // Generate a secure access token for the public invoice link
  const accessToken = nanoid(32)

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: 'SENT',
      accessToken,
      sentAt: new Date(),
    },
    include: INVOICE_WITH_ITEMS_INCLUDE,
  })

  return { invoice, accessToken }
}

// ============================================================================
// GET BY ACCESS TOKEN (PUBLIC)
// ============================================================================

/**
 * Get an invoice by its public access token.
 *
 * Used by the public invoice view page — no organization check needed
 * because the accessToken itself acts as authorization.
 * Returns sanitized data (InvoicePublicData) with only what the recipient
 * needs to see: invoice details, items, organization branding, and lead name.
 *
 * WHY sanitized: The public view must NOT expose internal IDs (organizationId,
 * leadId, stripePaymentIntentId, etc.) or any data beyond what the recipient needs.
 *
 * Only returns invoices with status SENT, PAID, or OVERDUE.
 * DRAFT and CANCELED invoices are not publicly accessible.
 *
 * SOURCE OF TRUTH KEYWORDS: GetByAccessToken, InvoicePublicFetch
 *
 * @param accessToken - Unique access token from the invoice URL
 * @returns Sanitized public invoice data, or null if not found / not accessible
 */
export async function getInvoiceByAccessToken(
  accessToken: string
): Promise<InvoicePublicData | null> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      accessToken,
      // Only publicly accessible statuses — DRAFT and CANCELED are hidden
      status: { in: ['SENT', 'PAID', 'OVERDUE'] },
    },
    include: {
      items: {
        select: {
          name: true,
          description: true,
          quantity: true,
          unitAmount: true,
          totalAmount: true,
          billingType: true,
          interval: true,
          intervalCount: true,
          trialDays: true,
        },
      },
      organization: true,
      lead: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  })

  if (!invoice) {
    return null
  }

  /**
   * Sanitize the response — strip internal fields, return only public data.
   * Organization is cast to access address/contactEmail safely (fields may
   * not exist in Prisma client until prisma generate is re-run after schema update).
   */
  const org = invoice.organization as Record<string, unknown>
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    name: invoice.name,
    status: invoice.status,
    notes: invoice.notes as object | null,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    totalAmount: invoice.totalAmount,
    sentAt: invoice.sentAt,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    items: invoice.items,
    organization: {
      name: org.name as string,
      logo: (org.logo as string | null) ?? null,
      rectangleLogo: (org.rectangleLogo as string | null) ?? null,
      stripeConnectedAccountId: (org.stripeConnectedAccountId as string | null) ?? null,
      address: (org.address as string | null) ?? null,
      contactEmail: (org.contactEmail as string | null) ?? null,
    },
    lead: invoice.lead,
  }
}

// ============================================================================
// MARK INVOICE PAID
// ============================================================================

/**
 * Mark an invoice as paid.
 *
 * Sets the status to PAID and records the paidAt timestamp.
 * Only SENT or OVERDUE invoices can be marked as paid — DRAFT invoices
 * haven't been sent yet, and CANCELED/PAID invoices are terminal states.
 *
 * WHY separate function: Payment is a distinct lifecycle event. This can be
 * called manually (admin action) or triggered by a Stripe webhook when the
 * payment is confirmed.
 *
 * SOURCE OF TRUTH KEYWORDS: MarkInvoicePaid, InvoicePaid
 *
 * @param id - Invoice ID to mark as paid
 * @param organizationId - Organization context for access control
 * @returns Updated invoice with items and lead relation
 * @throws Error if invoice not found or not in SENT/OVERDUE status
 */
export async function markInvoicePaid(
  id: string,
  organizationId: string
): Promise<InvoiceWithItems> {
  // Verify the invoice exists and belongs to this organization
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId },
  })

  if (!existing) {
    throw new Error(`Invoice not found: ${id}`)
  }

  // Guard: only SENT or OVERDUE invoices can be marked as paid
  if (existing.status !== 'SENT' && existing.status !== 'OVERDUE') {
    throw new Error(
      `Cannot mark invoice as paid with status ${existing.status}. Only SENT and OVERDUE invoices can be marked as paid.`
    )
  }

  return await prisma.invoice.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
    include: INVOICE_WITH_ITEMS_INCLUDE,
  })
}

// ============================================================================
// SYNC INVOICE ITEMS
// ============================================================================

/**
 * Replace all line items on an invoice with a new set.
 *
 * Uses a Prisma transaction to atomically:
 *   1. Delete all existing InvoiceItems for this invoice
 *   2. Insert the new set of items
 *   3. Recalculate and update the invoice's totalAmount
 *
 * WHY atomic transaction: Prevents partial updates — either ALL items are
 * replaced or NONE are. Without a transaction, a crash between delete and
 * insert would leave the invoice with zero items.
 *
 * WHY delete-and-recreate instead of upsert: Invoice items don't have stable
 * external IDs. The frontend sends the full list each time, so a clean
 * replace is simpler and avoids complex diff logic.
 *
 * SOURCE OF TRUTH KEYWORDS: SyncInvoiceItems, InvoiceItemSync
 *
 * @param invoiceId - Invoice ID whose items are being replaced
 * @param organizationId - Organization context for access control
 * @param items - New complete set of line items
 * @returns Updated invoice with new items and lead relation
 * @throws Error if invoice not found
 */
export async function syncInvoiceItems(
  invoiceId: string,
  organizationId: string,
  items: InvoiceItemInput[]
): Promise<InvoiceWithItems> {
  // Verify the invoice exists and belongs to this organization
  const existing = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
  })

  if (!existing) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }

  // Calculate the new totalAmount from the incoming items
  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitAmount,
    0
  )

  // Atomic transaction: delete old items, insert new ones, update totalAmount
  return await prisma.$transaction(async (tx) => {
    // Step 1: Delete all existing items for this invoice
    await tx.invoiceItem.deleteMany({
      where: { invoiceId },
    })

    // Step 2: Insert new items and update totalAmount in one operation
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount,
        items: {
          create: items.map((item) => ({
            name: item.name,
            description: item.description ?? null,
            productId: item.productId ?? null,
            priceId: item.priceId ?? null,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            totalAmount: item.quantity * item.unitAmount,
            billingType: item.billingType ?? 'ONE_TIME',
            interval: item.interval ?? null,
            intervalCount: item.intervalCount ?? null,
            trialDays: item.trialDays ?? null,
            isAdHoc: item.isAdHoc ?? false,
          })),
        },
      },
      include: INVOICE_WITH_ITEMS_INCLUDE,
    })

    return updatedInvoice
  })
}

// ============================================================================
// GET NEXT INVOICE NUMBER
// ============================================================================

/**
 * Generate the next sequential invoice number for an organization.
 *
 * Format: "INV-0001", "INV-0002", etc.
 * Finds the highest existing invoice number for this org, parses the numeric
 * portion, increments by 1, and zero-pads to 4 digits.
 *
 * WHY this approach: Simple sequential numbering is standard for invoices.
 * Zero-padding ensures consistent sorting and display width. Starting from
 * 0001 avoids confusion with "INV-0000".
 *
 * EDGE CASE: If no invoices exist yet, starts at "INV-0001".
 * EDGE CASE: If someone manually edits an invoice number, we still find the
 * max numeric portion correctly since we parse all existing numbers.
 *
 * SOURCE OF TRUTH KEYWORDS: GetNextInvoiceNumber, InvoiceNumberGenerator
 *
 * @param organizationId - Organization to generate the number for
 * @returns Next invoice number string (e.g. "INV-0042")
 */
export async function getNextInvoiceNumber(
  organizationId: string
): Promise<string> {
  // Fetch all invoice numbers for this org to find the highest one
  // WHY findMany instead of aggregate: invoiceNumber is a string, so we need
  // to parse the numeric portion manually rather than using SQL MAX on a string
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    select: { invoiceNumber: true },
    orderBy: { createdAt: 'desc' },
  })

  // Parse numeric portions from existing invoice numbers
  // Format expected: "INV-XXXX" where XXXX is a zero-padded number
  let maxNumber = 0

  for (const invoice of invoices) {
    const match = invoice.invoiceNumber.match(/^INV-(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNumber) {
        maxNumber = num
      }
    }
  }

  // Increment and zero-pad to 4 digits
  const nextNumber = maxNumber + 1
  const padded = String(nextNumber).padStart(4, '0')

  return `INV-${padded}`
}

// ============================================================================
// COMPLETE INVOICE PAYMENT (Stripe Webhook)
// ============================================================================

/**
 * Complete an invoice payment from Stripe webhook.
 *
 * UPDATED: Now checks for an existing Transaction created by the unified checkout
 * pipeline (createInvoiceCheckoutSession in checkout.service.ts). If a Transaction
 * already exists for this PaymentIntent, it simply calls completeTransaction()
 * and marks the invoice as PAID — no duplicate Transaction creation.
 *
 * Falls back to creating a Transaction if none exists (backwards compatibility
 * with any invoices created before the unified pipeline migration).
 *
 * WHY this function exists: When a customer pays an invoice via Stripe, we
 * need a Transaction record so the payment shows up in dashboard analytics,
 * revenue metrics, and the transactions list. Without this, invoice payments
 * would be invisible to the organization's financial reporting.
 *
 * NOTE: This is NOT called for manual "Mark as Paid" — that skips
 * transaction creation and metrics entirely.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicePaymentCompletion, CompleteInvoicePayment
 *
 * @param paymentIntentId - Stripe PaymentIntent ID from the webhook event
 * @param stripeAmount - Amount actually received by Stripe (in cents)
 * @param stripeChargeId - Stripe Charge ID for refund tracking
 * @param connectedAccountId - Stripe connected account ID (unused here but
 *   kept for signature consistency with other webhook handlers)
 */
export async function completeInvoicePayment(
  paymentIntentId: string,
  stripeAmount: number,
  stripeChargeId?: string,
  _connectedAccountId?: string
): Promise<void> {
  /**
   * Find the invoice by its linked Stripe PaymentIntent ID.
   * Include items and lead so we can build TransactionItems from invoice data.
   */
  const invoice = await prisma.invoice.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: {
      items: true,
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  })

  /**
   * IDEMPOTENCY GUARD:
   * - If no invoice found for this PI, it's not an invoice payment — skip
   * - If invoice is already PAID, this is a duplicate webhook event — skip
   */
  if (!invoice || invoice.status === 'PAID') {
    return
  }

  /**
   * CHECK FOR EXISTING TRANSACTION:
   * The unified checkout pipeline (createInvoiceCheckoutSession) creates a Transaction
   * in AWAITING_PAYMENT status and links it to the PaymentIntent. If that Transaction
   * exists, we just need to complete it — no new Transaction creation needed.
   *
   * Falls back to creating a Transaction for backwards compatibility with invoices
   * created before the unified pipeline migration.
   */
  const existingTransaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  if (!existingTransaction) {
    /**
     * LEGACY FALLBACK: No pre-existing Transaction — create one from invoice data.
     * This handles invoices that were paid before the unified pipeline was deployed.
     *
     * Determine overall billing type from items.
     * If ANY item is RECURRING, the transaction is RECURRING.
     * SOURCE OF TRUTH: InvoiceTransactionBillingType
     */
    const hasRecurring = invoice.items.some((item) => item.billingType === 'RECURRING')
    const overallBillingType = hasRecurring ? 'RECURRING' : 'ONE_TIME'

    await createTransaction({
      organizationId: invoice.organizationId,
      leadId: invoice.leadId ?? undefined,
      originalAmount: invoice.totalAmount,
      currency: invoice.currency,
      billingType: overallBillingType,
      stripePaymentIntentId: paymentIntentId,
      metadata: {
        source: 'invoice_payment',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
      items: invoice.items.map((item) => ({
        productId: item.productId ?? '',
        priceId: item.priceId ?? '',
        productName: item.name,
        priceName: item.productId ? 'Standard' : 'Custom',
        billingType: item.billingType as 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT',
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        totalAmount: item.totalAmount,
      })),
    })
  }

  /**
   * Run the standard completeTransaction flow which handles:
   * 1. Transaction status → PAID
   * 2. Inventory decrement for product-linked items
   * 3. Lead CLTV increment (stripeAmount / 100)
   * 4. TransactionPayment record creation (with chargeId for refund tracking)
   * 5. Per-product automation triggers (PAYMENT_COMPLETED)
   */
  await completeTransaction(paymentIntentId, stripeAmount, stripeChargeId)

  /**
   * Mark the invoice itself as PAID with the current timestamp.
   * This is separate from the Transaction status — the invoice lifecycle
   * and transaction lifecycle are independent records.
   */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  })
}

// ============================================================================
// COMPLETE INVOICE SUBSCRIPTION PAYMENT (Stripe Webhook)
// ============================================================================

/**
 * Complete an invoice payment that was processed via Stripe Subscription.
 *
 * Called from the connect-webhook when a subscription invoice.paid event
 * has metadata.source === 'invoice_payment' + metadata.invoiceId.
 *
 * TRIGGER FLOW DOCUMENTATION:
 * SOURCE OF TRUTH: InvoiceSubscriptionTriggerFlow
 *
 * This function intentionally does NOT fire automation triggers. Here's why:
 *
 * The webhook processes subscription payments in this order:
 *   1. invoice.paid → handleSubscriptionPayment() → fires all triggers
 *      (PAYMENT_COMPLETED, TRIAL_STARTED, SUBSCRIPTION_RENEWED via classify+dispatch)
 *   2. invoice.paid → completeInvoiceSubscriptionPayment() → marks Invoice as PAID
 *
 * Step 1 already handles:
 *   - Transaction status update (ACTIVE/PAID/PARTIALLY_PAID)
 *   - TransactionPayment record creation
 *   - Lead CLTV increment
 *   - Inventory decrement (first real charge only)
 *   - ALL automation triggers via dispatchSubscriptionTriggers()
 *
 * Step 2 (this function) only marks the Mochi Invoice record as PAID.
 * Firing triggers here would result in DUPLICATE triggers — once from
 * handleSubscriptionPayment() and once from here. This is by design.
 *
 * @param subscriptionId - Stripe subscription ID from the webhook event
 */
export async function completeInvoiceSubscriptionPayment(
  subscriptionId: string
): Promise<void> {
  /** Find the invoice by its linked Stripe subscription ID */
  const invoice = await prisma.invoice.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  })

  /**
   * IDEMPOTENCY GUARD:
   * - If no invoice found for this subscription, it's not an invoice payment — skip
   * - If invoice is already PAID, this is a duplicate webhook event — skip
   */
  if (!invoice || invoice.status === 'PAID') {
    return
  }

  /** Mark the invoice as PAID with the current timestamp */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  })

  console.log(`[invoice-sub-complete] Invoice ${invoice.invoiceNumber} marked as PAID via subscription ${subscriptionId}`)
}

// ============================================================================
// GENERATE INVOICE FROM RECEIPT
// ============================================================================

/**
 * Generate a formal invoice document from an existing payment receipt.
 *
 * Called when a customer clicks "Download Invoice" on their receipt page.
 * Creates a PAID invoice linked to the TransactionPayment, populated with
 * the same line items from the parent Transaction.
 *
 * IDEMPOTENT: If an invoice already exists for this payment, returns the
 * existing one instead of creating a duplicate. This is safe to call
 * multiple times (e.g. user clicking "Download Invoice" repeatedly).
 *
 * WHY this exists: Customers often need a formal invoice for accounting
 * or tax purposes after completing a payment. This auto-generates one
 * from the receipt data without requiring manual invoice creation.
 *
 * NOTE: Does NOT create a Transaction record — the payment already has one.
 * This avoids double-counting in analytics and revenue metrics.
 *
 * SOURCE OF TRUTH KEYWORDS: GenerateInvoiceFromReceipt, ReceiptToInvoice
 *
 * @param paymentId - TransactionPayment.id (CUID) to generate invoice from
 * @returns The invoice ID and public access token for download
 * @throws Error if payment not found or not in SUCCEEDED status
 */
export async function generateInvoiceFromReceipt(
  paymentId: string
): Promise<{ invoiceId: string; accessToken: string }> {
  /**
   * IDEMPOTENCY CHECK: If an invoice already exists for this payment,
   * return it immediately. The `transactionPaymentId` unique constraint
   * guarantees at most one invoice per payment.
   */
  const existing = await prisma.invoice.findUnique({
    where: { transactionPaymentId: paymentId },
    select: { id: true, accessToken: true },
  })

  if (existing) {
    return {
      invoiceId: existing.id,
      accessToken: existing.accessToken ?? '',
    }
  }

  /**
   * Fetch the payment with its parent transaction, items, and lead.
   * We need the transaction's items to populate InvoiceItems, and the
   * lead for linking the invoice to the customer.
   *
   * Cast is needed because the `invoice` relation on TransactionPayment
   * may not be in the generated Prisma types yet.
   */
  const payment = await prisma.transactionPayment.findUnique({
    where: { id: paymentId },
    include: {
      transaction: {
        include: {
          items: true,
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  })

  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`)
  }

  /* Only generate invoices for successful payments */
  if (payment.status !== 'SUCCEEDED') {
    throw new Error(
      `Cannot generate invoice for payment with status ${payment.status}. Only SUCCEEDED payments can have invoices.`
    )
  }

  const { transaction } = payment
  const items = transaction.items

  /* Generate the next sequential invoice number for this organization */
  const invoiceNumber = await getNextInvoiceNumber(transaction.organizationId)

  /* Generate a secure access token for the public invoice link */
  const accessToken = nanoid(32)

  /**
   * Build the invoice name from the purchased items:
   * - Single item: "Invoice for {productName}"
   * - Multiple items: "Invoice for Payment #{paymentNumber}"
   */
  const invoiceName =
    items.length === 1
      ? `Invoice for ${items[0].productName}`
      : `Invoice for Payment #${payment.paymentNumber}`

  /* Create the invoice with all line items in a single Prisma call */
  const invoice = await prisma.invoice.create({
    data: {
      organizationId: transaction.organizationId,
      leadId: transaction.leadId,
      invoiceNumber,
      name: invoiceName,
      status: 'PAID',
      currency: payment.currency,
      totalAmount: payment.amount,
      accessToken,
      transactionPaymentId: paymentId,
      sentAt: new Date(),
      paidAt: payment.paidAt ?? new Date(),
      items: {
        create: items.map((item) => ({
          name: item.productName,
          description: item.priceName,
          productId: item.productId,
          priceId: item.priceId,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          totalAmount: item.totalAmount,
          billingType: item.billingType,
          interval: item.interval,
          intervalCount: item.intervalCount,
          isAdHoc: false,
        })),
      },
    },
  })

  return { invoiceId: invoice.id, accessToken }
}

// ============================================================================
// GET RECEIPT LINKED INVOICE
// ============================================================================

/**
 * Check if an invoice has already been generated for a given payment.
 *
 * Used by the receipt page to determine whether to show "Download Invoice"
 * (invoice exists) or "Generate Invoice" (no invoice yet).
 *
 * SOURCE OF TRUTH KEYWORDS: GetReceiptLinkedInvoice, ReceiptInvoiceCheck
 *
 * @param paymentId - TransactionPayment.id (CUID)
 * @returns The invoice's public access token if it exists, null otherwise
 */
export async function getReceiptLinkedInvoice(
  paymentId: string
): Promise<string | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { transactionPaymentId: paymentId },
    select: { accessToken: true },
  })

  return invoice?.accessToken ?? null
}
