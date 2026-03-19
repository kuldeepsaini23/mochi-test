/**
 * Invoices tRPC Router
 *
 * API endpoints for invoice CRUD operations, sending, payment, and public access.
 * Used by the invoices listing page, invoice builder UI, and public invoice payment page.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoicesRouter, InvoiceAPI, InvoiceEndpoints
 *
 * INVOICE ENDPOINTS:
 * - list: Get paginated list of invoices with search, status, page, and limit filters
 * - getById: Get single invoice by ID (includes items and lead)
 * - create: Create new invoice (defaults to DRAFT, auto-generates invoice number)
 * - update: Update existing invoice metadata (name, notes, dueDate, currency, leadId)
 * - updateItems: Full replacement of invoice line items (recalculates totalAmount)
 * - delete: Hard delete an invoice
 * - send: Send a DRAFT invoice to the assigned lead (generates access token + emails)
 * - markPaid: Manually mark an invoice as PAID (for offline/manual payments)
 * - getByAccessToken: Public — fetch an invoice by its access token (no auth)
 * - createPaymentSession: Public — create a Stripe PaymentIntent for the invoice (no auth)
 *
 * PERMISSIONS:
 * - INVOICES_READ: list, getById
 * - INVOICES_CREATE: create
 * - INVOICES_UPDATE: update, updateItems, send, markPaid
 * - INVOICES_DELETE: delete
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import { ERROR_CODES } from '@/lib/errors'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  getInvoiceByAccessToken,
  markInvoicePaid,
  syncInvoiceItems,
  generateInvoiceFromReceipt,
  getReceiptLinkedInvoice,
} from '@/services/invoice.service'
import { createInvoiceCheckoutSession } from '@/services/payment/checkout.service'
import { sendInvoiceEmail } from '@/services/email.service'
import { recordOutboundEmail } from '@/services/inbox.service'
import { stripHtml } from '@/lib/utils/lead-helpers'
import { getOrganizationCurrency } from '@/services/currency.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for invoice line items — represents a single billable line on the invoice.
 * Can reference an existing product/price OR be an ad-hoc custom item.
 *
 * SOURCE OF TRUTH: Mirrors InvoiceItem model in Prisma schema
 */
const invoiceItemSchema = z.object({
  /** Existing item ID for updates (omit for new items) */
  id: z.string().optional(),
  /** Product reference — null for ad-hoc items */
  productId: z.string().nullable().optional(),
  /** Price reference — null for ad-hoc items */
  priceId: z.string().nullable().optional(),
  /** Display name for the line item */
  name: z.string().min(1, 'Item name is required'),
  /** Optional description for the line item */
  description: z.string().nullable().optional(),
  /** Number of units */
  quantity: z.number().int().positive().default(1),
  /** Price per unit in cents */
  unitAmount: z.number().int().min(0),
  /** Billing type — mostly ONE_TIME for invoices */
  billingType: z.enum(['ONE_TIME', 'RECURRING', 'SPLIT_PAYMENT']).default('ONE_TIME'),
  /** Billing interval for recurring items */
  interval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).nullable().optional(),
  /** How many intervals between payments */
  intervalCount: z.number().int().positive().nullable().optional(),
  /** Free trial period in days — SOURCE OF TRUTH: InvoiceItemTrialDays */
  trialDays: z.number().int().positive().nullable().optional(),
  /** Whether this is a custom ad-hoc item (not linked to a product) */
  isAdHoc: z.boolean().default(false),
})

/**
 * Schema for listing invoices with pagination, search, and status filters.
 */
const listInvoicesSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELED']).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

/**
 * Schema for getting a single invoice by ID.
 */
const getInvoiceByIdSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for creating a new invoice.
 * Only requires organizationId and name — everything else is optional at creation time.
 */
const createInvoiceSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  /** Recipient lead ID — can be assigned later */
  leadId: z.string().nullable().optional(),
  /** Payment due date */
  dueDate: z.string().datetime().nullable().optional(),
  /** Currency code (defaults to "usd" in the service layer) */
  currency: z.string().min(3).max(3).optional(),
  /** Initial line items to create with the invoice */
  items: z.array(invoiceItemSchema).optional(),
})

/**
 * Schema for updating invoice metadata.
 * Does NOT update line items — use updateItems for that.
 */
const updateInvoiceSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  /** Rich-text notes (Lexical SerializedEditorState JSON) */
  notes: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Payment due date */
  dueDate: z.string().datetime().nullable().optional(),
  /** Currency code */
  currency: z.string().min(3).max(3).optional(),
  /** Recipient lead ID */
  leadId: z.string().nullable().optional(),
})

/**
 * Schema for syncing (full replacement) of invoice line items.
 * Pass the complete list of items — missing items will be deleted, new ones created.
 */
const updateItemsSchema = z.object({
  invoiceId: z.string(),
  organizationId: z.string(),
  items: z.array(invoiceItemSchema),
})

/**
 * Schema for deleting an invoice.
 */
const deleteInvoiceSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for sending an invoice (transitions DRAFT -> SENT).
 * sendEmail: when true, sends a notification email to the assigned lead after status transition.
 * When false, just marks the invoice as SENT without emailing (Mark as Sent).
 */
const sendInvoiceSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  sendEmail: z.boolean().default(false),
})

/**
 * Schema for manually marking an invoice as PAID.
 */
const markPaidSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

/**
 * Schema for creating a payment session from the public invoice page.
 * Stub for now — full Stripe integration will be implemented separately.
 */
const createPaymentSessionSchema = z.object({
  accessToken: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const invoicesRouter = createTRPCRouter({
  // ==========================================================================
  // INVOICE ENDPOINTS
  // ==========================================================================

  /**
   * List invoices with pagination, search, and status filter.
   *
   * Returns a paginated result set with invoice data, total count, and page metadata.
   * Supports searching by invoice name/number and filtering by status.
   *
   * Permission: INVOICES_READ
   */
  list: organizationProcedure({ requirePermission: permissions.INVOICES_READ })
    .input(listInvoicesSchema)
    .query(async ({ input }) => {
      return await listInvoices(input)
    }),

  /**
   * Get a single invoice by ID, including its line items and lead data.
   *
   * Returns the full invoice with nested items and assigned lead.
   * Throws NOT_FOUND if the invoice doesn't exist or doesn't belong to the organization.
   *
   * Permission: INVOICES_READ
   */
  getById: organizationProcedure({ requirePermission: permissions.INVOICES_READ })
    .input(getInvoiceByIdSchema)
    .query(async ({ input }) => {
      const invoice = await getInvoiceById(input.id, input.organizationId)

      if (!invoice) {
        throw createStructuredError('NOT_FOUND', 'Invoice not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invoice not found',
        })
      }

      return invoice
    }),

  /**
   * Create a new invoice with DRAFT status.
   *
   * Auto-generates a sequential invoice number (e.g. "INV-0001") for the organization.
   * Optionally accepts initial line items and a lead assignment.
   * Feature-gated: invoices.limit checked at procedure level before handler runs.
   *
   * Permission: INVOICES_CREATE
   */
  create: organizationProcedure({
    requirePermission: permissions.INVOICES_CREATE,
    requireFeature: 'invoices.limit',
  })
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        /**
         * CURRENCY ENFORCEMENT: Always use the org's Stripe account currency.
         * Client-provided currency is IGNORED — prevents AI hallucination and
         * ensures all invoices match the org's Stripe payout currency.
         * SOURCE OF TRUTH: Organization.stripeAccountCurrency via currency.service
         */
        const { currency: orgCurrency } = await getOrganizationCurrency(input.organizationId)

        const result = await createInvoice({
          organizationId: input.organizationId,
          name: input.name,
          leadId: input.leadId ?? undefined,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          currency: orgCurrency,
          items: input.items,
        })

        // Increment usage after successful creation
        await incrementUsageAndInvalidate(ctx, input.organizationId, 'invoices.limit')

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create invoice'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Update an existing invoice's metadata (name, notes, dueDate, currency, leadId).
   *
   * Does NOT update line items — use the `updateItems` procedure for that.
   * Cannot update invoices that are already PAID or CANCELED.
   *
   * Permission: INVOICES_UPDATE
   */
  update: organizationProcedure({ requirePermission: permissions.INVOICES_UPDATE })
    .input(updateInvoiceSchema)
    .mutation(async ({ input }) => {
      try {
        /**
         * CURRENCY ENFORCEMENT: If currency is being set, force the org's Stripe currency.
         * Client-provided currency values are IGNORED — the org's Stripe account
         * currency is the only valid value.
         */
        let resolvedCurrency: string | undefined
        if (input.currency !== undefined) {
          const { currency: orgCurrency } = await getOrganizationCurrency(input.organizationId)
          resolvedCurrency = orgCurrency
        }

        return await updateInvoice(input.id, input.organizationId, {
          name: input.name,
          notes: input.notes,
          dueDate: input.dueDate ? new Date(input.dueDate) : input.dueDate === null ? null : undefined,
          currency: resolvedCurrency,
          leadId: input.leadId,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update invoice'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Invoice not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invoice not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Sync (full replacement) of invoice line items.
   *
   * Replaces ALL existing line items with the provided list.
   * Items with an `id` that already exists are updated; items without an `id` are created.
   * Existing items not present in the input list are deleted.
   * Recalculates the invoice totalAmount after sync.
   *
   * Permission: INVOICES_UPDATE
   */
  updateItems: organizationProcedure({ requirePermission: permissions.INVOICES_UPDATE })
    .input(updateItemsSchema)
    .mutation(async ({ input }) => {
      try {
        return await syncInvoiceItems(input.invoiceId, input.organizationId, input.items)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update invoice items'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Invoice not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invoice not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Permanently delete an invoice (hard delete).
   *
   * Removes the invoice and all its line items from the database.
   * Cannot be undone.
   *
   * Permission: INVOICES_DELETE
   */
  delete: organizationProcedure({ requirePermission: permissions.INVOICES_DELETE })
    .input(deleteInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteInvoice(input.id, input.organizationId)

        // Decrement usage after successful deletion
        await decrementUsageAndInvalidate(ctx, input.organizationId, 'invoices.limit')

        return { success: true, message: 'Invoice deleted successfully' }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete invoice'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Invoice not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invoice not found',
          })
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        })
      }
    }),

  /**
   * Send an invoice to the assigned lead.
   *
   * Transitions the invoice from DRAFT to SENT status, generates a secure
   * access token for the public payment link, records sentAt, and sends
   * a notification email to the lead.
   *
   * Requires the invoice to be in DRAFT status and have a lead assigned.
   *
   * Permission: INVOICES_UPDATE
   */
  send: organizationProcedure({ requirePermission: permissions.INVOICES_UPDATE })
    .input(sendInvoiceSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await sendInvoice(input.id, input.organizationId)

        /**
         * Optionally send an email notification to the assigned lead.
         * WHY: "Mark as Sent" (sendEmail=false) just transitions status;
         * "Send to {email}" (sendEmail=true) transitions AND emails.
         *
         * Fire-and-forget: email failure does NOT fail the mutation —
         * the invoice is already SENT regardless.
         */
        /**
         * Send invoice email if requested.
         * Track whether email delivery failed so the frontend can warn the user.
         * NOTE: Email failure does NOT fail the mutation — invoice is already SENT in DB.
         */
        let emailFailed = false
        let emailError: string | undefined

        if (input.sendEmail && result.invoice.lead?.email) {
          try {
            const lead = result.invoice.lead
            const recipientName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || undefined

            /** Format the total amount for display in the email */
            const formattedAmount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: result.invoice.currency.toUpperCase(),
            }).format(result.invoice.totalAmount / 100)

            /** Format the due date if set */
            const formattedDueDate = result.invoice.dueDate
              ? new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(result.invoice.dueDate))
              : null

            const emailResult = await sendInvoiceEmail({
              to: lead.email,
              invoiceName: result.invoice.name,
              invoiceNumber: result.invoice.invoiceNumber,
              totalAmount: formattedAmount,
              currency: result.invoice.currency,
              dueDate: formattedDueDate,
              accessToken: result.accessToken,
              organizationId: input.organizationId,
              recipientName,
            })

            if (!emailResult.success) {
              emailFailed = true
              emailError = emailResult.error ?? 'Failed to send email'
              console.error('Invoice email send failed:', emailResult.error)
            }

            /**
             * Record the sent invoice email in the lead's inbox conversation
             * WHY: Makes invoice emails visible in the conversation tab
             * NOTE: Non-blocking — recording failure should NOT fail the mutation
             */
            if (emailResult.success && emailResult.html && result.invoice.leadId) {
              try {
                await recordOutboundEmail({
                  organizationId: input.organizationId,
                  leadId: result.invoice.leadId,
                  subject: `Invoice ${result.invoice.invoiceNumber} — Ready for payment`,
                  body: stripHtml(emailResult.html),
                  bodyHtml: emailResult.html,
                  toEmail: lead.email,
                  fromEmail: emailResult.fromAddress,
                  resendMessageId: emailResult.messageId,
                })
              } catch (recordError) {
                console.error('Failed to record invoice email in inbox:', recordError)
              }
            }
          } catch (err) {
            emailFailed = true
            emailError = err instanceof Error ? err.message : 'Failed to send email'
            console.error('Failed to send invoice email:', err)
          }
        }

        return { success: true, accessToken: result.accessToken, emailFailed, emailError }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send invoice'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        // Handle status validation errors (e.g. "Only DRAFT invoices can be sent")
        if (message.includes('Only DRAFT') || message.includes('must have a lead')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * Manually mark an invoice as PAID.
   *
   * Used for offline or manual payments that don't go through Stripe.
   * Sets the status to PAID and records paidAt timestamp.
   *
   * Only SENT or OVERDUE invoices can be marked as paid.
   *
   * Permission: INVOICES_UPDATE
   */
  markPaid: organizationProcedure({ requirePermission: permissions.INVOICES_UPDATE })
    .input(markPaidSchema)
    .mutation(async ({ input }) => {
      try {
        const invoice = await markInvoicePaid(input.id, input.organizationId)
        return { success: true, invoiceId: invoice.id }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to mark invoice as paid'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        // Handle status validation errors (e.g. "Only SENT or OVERDUE invoices can be marked paid")
        if (message.includes('Only SENT') || message.includes('Only OVERDUE')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * Get an invoice by its public access token (NO AUTH REQUIRED).
   *
   * Used by the public invoice payment page. The access token itself
   * acts as authorization — no session or organization check is needed.
   * Returns the full invoice with items and lead data for display.
   */
  getByAccessToken: baseProcedure
    .input(z.object({ accessToken: z.string().min(1) }))
    .query(async ({ input }) => {
      const invoice = await getInvoiceByAccessToken(input.accessToken)

      if (!invoice) {
        throw createStructuredError('NOT_FOUND', 'Invoice not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invoice not found or invalid access token',
        })
      }

      return invoice
    }),

  /**
   * Create a Stripe PaymentIntent for a public invoice (NO AUTH REQUIRED).
   *
   * Called from the public invoice payment page when a customer clicks "Pay".
   * The access token acts as authorization — no session check needed.
   *
   * Creates a PaymentIntent on the organization's connected Stripe account
   * with the invoice's total amount and currency. Returns the clientSecret
   * for Stripe Elements to confirm payment on the frontend.
   *
   * SOURCE OF TRUTH KEYWORDS: InvoicePaymentSession, InvoiceCheckout
   */
  createPaymentSession: baseProcedure
    .input(createPaymentSessionSchema)
    .mutation(async ({ input }) => {
      try {
        /**
         * Route through the unified checkout pipeline (checkout.service.ts).
         * Replaces the old createInvoicePaymentIntent from invoice.service.ts.
         * SOURCE OF TRUTH: InvoiceUnifiedCheckout
         */
        const result = await createInvoiceCheckoutSession({
          accessToken: input.accessToken,
          customer: {
            email: input.customerEmail || '',
            firstName: input.customerName?.split(' ')[0] || '',
            lastName: input.customerName?.split(' ').slice(1).join(' ') || '',
          },
        })

        return {
          success: true,
          clientSecret: result.clientSecret,
          invoiceId: result.invoiceId,
          totalAmount: result.totalAmount,
          currency: result.currency,
          /** Whether this is a trial (SetupIntent) — frontend uses confirmSetup() */
          isTrial: result.isTrial,
          /** Payment type — 'subscription' or 'payment_intent' */
          type: result.type,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create payment session'

        if (message.includes('not found') || message.includes('not payable')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('not connected') || message.includes('greater than zero')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  // ==========================================================================
  // RECEIPT → INVOICE ENDPOINTS (PUBLIC)
  // ==========================================================================

  /**
   * Generate an invoice from a payment receipt (NO AUTH REQUIRED).
   *
   * Called when a customer clicks "Download Invoice" on their receipt page.
   * The payment ID (CUID) is unguessable and serves as authorization.
   * Idempotent — safe to call multiple times for the same payment.
   *
   * SOURCE OF TRUTH KEYWORDS: GenerateFromReceipt, ReceiptInvoiceGenerate
   */
  generateFromReceipt: baseProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const result = await generateInvoiceFromReceipt(input.paymentId)
        return {
          success: true,
          invoiceId: result.invoiceId,
          accessToken: result.accessToken,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to generate invoice'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        if (message.includes('Cannot generate')) {
          throw createStructuredError('BAD_REQUEST', message, {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          })
        }

        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  /**
   * Check if an invoice already exists for a payment receipt (NO AUTH REQUIRED).
   *
   * Returns the invoice's public access token if it exists, or null if
   * no invoice has been generated yet. Used by the receipt page to
   * determine button state ("Generate" vs "Download").
   *
   * SOURCE OF TRUTH KEYWORDS: GetLinkedInvoice, ReceiptInvoiceCheck
   */
  getLinkedInvoiceForReceipt: baseProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const accessToken = await getReceiptLinkedInvoice(input.paymentId)
      return { accessToken }
    }),
})
