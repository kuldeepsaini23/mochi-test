/**
 * ============================================================================
 * MOCHI AI TOOLS - INVOICES
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for invoice management.
 * Uses "Name:DOLLARS" flat string format for line items because nested
 * z.object() arrays break AI model tool calling — models send empty [{}, {}].
 *
 * SECURITY: Routes all operations through tRPC caller so that permissions,
 * feature gates, and Stripe connect checks are enforced — never bypassed.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiInvoiceTools, AIInvoiceManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'
import { resolveLeadId } from './resolve-helpers'

/**
 * Parses a flat "ItemName:DOLLARS" or "ItemName:DOLLARS:QUANTITY" string
 * into an invoice line item config.
 *
 * Format: "Name:DOLLARS" or "Name:DOLLARS:QUANTITY"
 * Examples: "Web Design:5000", "Logo Design:2500:2", "Monthly Hosting:100:12"
 *
 * DOLLARS is converted to cents (* 100) for the service layer.
 */
function parseInvoiceItemString(str: string): {
  name: string
  quantity: number
  unitAmount: number
  isAdHoc: boolean
} {
  const parts = str.split(':').map((s) => s.trim())
  const name = parts[0] || 'Line Item'
  const dollars = parseFloat(parts[1] || '0')
  const quantity = parseInt(parts[2] || '1', 10) || 1

  return {
    name,
    quantity,
    /** Convert dollars to cents for the service layer */
    unitAmount: Math.round(dollars * 100),
    isAdHoc: true,
  }
}

/**
 * Creates all invoice-related tools bound to the given organization.
 * Uses the tRPC caller for secure procedure invocation with full middleware.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, and Stripe connect
 */
export function createInvoiceTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new invoice with line items using flat string format.
     * Amount is in DOLLARS — system converts to cents automatically.
     * Routes through tRPC `invoices.create` which enforces INVOICES_CREATE permission.
     */
    createInvoice: tool({
      description:
        'Create a new invoice with line items. ' +
        'Set the customer using EITHER leadSearch (preferred — pass name or email) OR leadId (only if verified). ' +
        'Each item string must be in "Name:DOLLARS" or "Name:DOLLARS:QUANTITY" format. ' +
        'Amount is in dollars (e.g., 5000 for $5,000). Quantity defaults to 1. ' +
        'Example items: ["Web Design:5000", "Logo Design:2500:2", "Monthly Hosting:100:12"]',
      inputSchema: z.object({
        name: z.string().describe('Invoice name/title (e.g., "Invoice for Acme Corp")'),
        leadSearch: z
          .string()
          .optional()
          .describe(
            'Search for the customer by name or email. PREFERRED over leadId — ' +
            'the system finds the matching lead automatically.'
          ),
        leadId: z
          .string()
          .optional()
          .describe('Lead ID — ONLY if verified from a previous listLeads/getLead result. Prefer leadSearch.'),
        dueDate: z.string().optional().describe('Due date in ISO 8601 format (e.g., "2026-04-01")'),
        items: z
          .array(z.string())
          .describe(
            'Line items in "Name:DOLLARS" or "Name:DOLLARS:QUANTITY" format. ' +
            'Example: ["Web Design:5000", "Logo Design:2500:2", "Monthly Hosting:100:12"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Resolve lead: prefer search by name/email, fall back to direct ID.
           * Prevents AI from fabricating lead IDs.
           */
          let resolvedLeadId: string | undefined
          const leadResult = await resolveLeadId(
            caller, organizationId, params.leadId, params.leadSearch
          )
          if (leadResult) {
            if (!leadResult.success) return leadResult
            resolvedLeadId = leadResult.leadId
          }

          /** Parse flat item strings into invoice line item configs */
          const parsedItems = params.items.map(parseInvoiceItemString)

          /**
           * tRPC invoices.create expects:
           * - dueDate as ISO 8601 datetime string (or null/undefined)
           * - items as array of invoiceItemSchema objects
           * NOTE: Currency is NOT passed — the router forces the org's Stripe currency.
           * AI has 0% control over currency to prevent hallucinated currency codes.
           */
          const invoice = await caller.invoices.create({
            organizationId,
            name: params.name,
            leadId: resolvedLeadId,
            dueDate: params.dueDate ? new Date(params.dueDate).toISOString() : undefined,
            items: parsedItems,
          })
          return {
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            itemsCreated: parsedItems.map((i) => `${i.name} ($${(i.unitAmount / 100).toFixed(2)} x ${i.quantity})`),
            message: `Created invoice ${invoice.invoiceNumber} with ${parsedItems.length} line items (ID: ${invoice.id})`,
            /** Event bus: navigate to invoice builder after creation */
            _event: { feature: 'invoice', action: 'created', entityId: invoice.id, navigate: true },
          }
        } catch (err) {
          return handleToolError('createInvoice', err)
        }
      },
    }),

    /**
     * Update a draft invoice's name or due date.
     * Only draft invoices can be modified.
     * Routes through tRPC `invoices.update` which enforces INVOICES_UPDATE permission.
     * NOTE: tRPC update uses `id` (not `invoiceId`) as the field name.
     */
    updateInvoice: tool({
      description:
        'Update a draft invoice (change name or due date). Only draft invoices can be modified. ' +
        'Use the invoice ID from createInvoice or listInvoices results.',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to update (from a previous tool result)'),
        name: z.string().optional().describe('New invoice name'),
        dueDate: z.string().optional().describe('New due date in ISO 8601 format'),
      }),
      execute: async (params) => {
        try {
          /** tRPC invoices.update uses `id` field (not `invoiceId`) */
          const invoice = await caller.invoices.update({
            organizationId,
            id: params.invoiceId,
            name: params.name,
            dueDate: params.dueDate ? new Date(params.dueDate).toISOString() : undefined,
          })
          return {
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            message: `Updated invoice ${invoice.invoiceNumber}`,
            /** Event bus: notify builders that invoice metadata changed */
            _event: { feature: 'invoice', action: 'updated', entityId: invoice.id },
          }
        } catch (err) {
          return handleToolError('updateInvoice', err)
        }
      },
    }),

    /**
     * Send an invoice to the customer via email.
     * Changes status from DRAFT to SENT.
     * Routes through tRPC `invoices.send` which enforces INVOICES_UPDATE permission.
     * NOTE: tRPC send uses `id` (not `invoiceId`) and returns { success, accessToken }
     * (not the full invoice object), so we build the URL from accessToken.
     *
     * SAFETY GUARD: Requires `userConfirmedSend` to be explicitly true.
     * Code-level guard against AI auto-sending. Prompt-level instructions alone
     * are insufficient — LLMs can misinterpret and call send without user consent.
     * This is destructive and irreversible (the invoice gets emailed to the customer).
     */
    sendInvoice: tool({
      description:
        'Send an invoice to the customer via email. Changes status from DRAFT to SENT. ' +
        'The invoice must have a lead associated with it. ' +
        'You MUST first use askUser to get EXPLICIT user confirmation before calling this tool.',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to send'),
        userConfirmedSend: z
          .boolean()
          .describe(
            'REQUIRED: Must be true. You MUST first use askUser to get EXPLICIT user confirmation ' +
            '(e.g., "Should I send this invoice to [customer name]?") BEFORE calling this tool. ' +
            'If the user has not explicitly said to send it, do NOT call this tool.'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * CODE-LEVEL CONSENT GUARD
           * -------------------------
           * Sending an invoice is destructive and irreversible — an email goes out
           * to the customer and the status changes from DRAFT to SENT. Prompt-level
           * instructions ("NEVER auto-send") can be misinterpreted by the LLM.
           * This hard check ensures the model explicitly confirmed with the user
           * via askUser before reaching this point.
           */
          if (params.userConfirmedSend !== true) {
            return {
              success: false,
              message:
                'Cannot send invoice without explicit user confirmation. ' +
                'Use askUser first to confirm: "Should I send this invoice to [customer name]?" ' +
                'Only call sendInvoice after the user explicitly agrees.',
              errorCode: 'VALIDATION_ERROR' as const,
            }
          }

          /**
           * tRPC invoices.send uses `id` and `sendEmail` fields.
           * We pass sendEmail: true so the customer receives the email notification.
           * The tRPC procedure returns { success, accessToken } — not the full invoice.
           */
          const result = await caller.invoices.send({
            organizationId,
            id: params.invoiceId,
            sendEmail: true,
          })
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const invoiceUrl = `${baseUrl}/invoice/${result.accessToken}`
          return {
            success: true,
            invoiceId: params.invoiceId,
            invoiceUrl,
            message: `Sent invoice. View: ${invoiceUrl}`,
            /** Event bus: notify builders that invoice was sent (status change) */
            _event: { feature: 'invoice', action: 'sent', entityId: params.invoiceId },
          }
        } catch (err) {
          return handleToolError('sendInvoice', err)
        }
      },
    }),

    /**
     * Permanently delete a DRAFT invoice.
     * ALWAYS confirm with askUser before calling this tool.
     * Routes through tRPC `invoices.delete` which enforces INVOICES_DELETE permission.
     * NOTE: tRPC delete uses `id` (not `invoiceId`).
     */
    deleteInvoice: tool({
      description:
        'Permanently delete an invoice and all its line items. Only DRAFT invoices can be deleted. ' +
        'ALWAYS confirm with askUser before calling this tool.',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.invoices.delete({
            organizationId,
            id: params.invoiceId,
          })
          return {
            success: true,
            invoiceId: params.invoiceId,
            message: `Deleted invoice (ID: ${params.invoiceId})`,
            /** Event bus: notify that invoice was deleted */
            _event: { feature: 'invoice', action: 'deleted', entityId: params.invoiceId },
          }
        } catch (err) {
          return handleToolError('deleteInvoice', err)
        }
      },
    }),

    /**
     * List invoices with optional status filter.
     * Routes through tRPC `invoices.list` which enforces INVOICES_READ permission.
     */
    listInvoices: tool({
      description: 'List invoices in the organization. Optionally filter by status.',
      inputSchema: z.object({
        status: z
          .enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELED'])
          .optional()
          .describe('Filter by invoice status'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.invoices.list({
            organizationId,
            status: params.status,
            page: 1,
            limit: 20,
          })
          return {
            success: true,
            invoices: result.invoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              name: inv.name,
              status: inv.status,
              totalAmount: inv.totalAmount,
              currency: inv.currency,
            })),
            total: result.total,
            message: `Found ${result.total} invoices`,
          }
        } catch (err) {
          return handleToolError('listInvoices', err)
        }
      },
    }),

    /**
     * Replace all line items on a draft invoice with a new set.
     * Uses the same flat "Name:DOLLARS" or "Name:DOLLARS:QUANTITY" string format
     * as createInvoice. Atomically deletes old items and inserts new ones.
     * Only draft invoices can have their items replaced.
     * Routes through tRPC `invoices.updateItems` which enforces INVOICES_UPDATE permission.
     */
    updateInvoiceItems: tool({
      description:
        'Replace all line items on a draft invoice with a new set of items. ' +
        'Uses the same "Name:DOLLARS" or "Name:DOLLARS:QUANTITY" format as createInvoice. ' +
        'This completely replaces existing items — include ALL desired items. ' +
        'Example items: ["Web Design:5000", "Logo Design:2500:2"]',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to update items on'),
        items: z
          .array(z.string())
          .describe(
            'Line items in "Name:DOLLARS" or "Name:DOLLARS:QUANTITY" format. ' +
            'Replaces ALL existing items. Example: ["Web Design:5000", "Logo:2500:2"]'
          ),
      }),
      execute: async (params) => {
        try {
          /** Parse flat item strings into invoice line item configs */
          const parsedItems = params.items.map(parseInvoiceItemString)

          /** tRPC invoices.updateItems uses `invoiceId` (matches the tool param name) */
          const invoice = await caller.invoices.updateItems({
            invoiceId: params.invoiceId,
            organizationId,
            items: parsedItems,
          })
          return {
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            /** Display the total in dollars (service stores cents) */
            totalAmount: `$${(invoice.totalAmount / 100).toFixed(2)}`,
            itemsSet: parsedItems.map(
              (i) => `${i.name} ($${(i.unitAmount / 100).toFixed(2)} x ${i.quantity})`
            ),
            message: `Replaced items on invoice ${invoice.invoiceNumber} with ${parsedItems.length} new items`,
            /** Event bus: notify builders that line items changed */
            _event: { feature: 'invoice', action: 'items_changed', entityId: invoice.id },
          }
        } catch (err) {
          return handleToolError('updateInvoiceItems', err)
        }
      },
    }),

    /**
     * Add an existing product (by product ID + price ID) to a draft invoice.
     * Creates a properly linked line item (not ad-hoc) with the product's
     * actual name, price, and billing info. The item retains its link to
     * the product/price so it shows as a "Product" item in the invoice builder.
     *
     * COMPOSITE TOOL: Chains three tRPC calls:
     * 1. `products.getById` — fetch product + validate price
     * 2. `invoices.getById` — fetch existing items to preserve them
     * 3. `invoices.updateItems` — sync all items (existing + new) atomically
     */
    addProductToInvoice: tool({
      description:
        'Add an existing product to a draft invoice as a linked line item. ' +
        'Requires the invoice ID, product ID, and price ID. ' +
        'Use listProducts or getProduct first to find the product and its prices. ' +
        'If the product has multiple prices, ask the user which one to use via askUser. ' +
        'The item will be linked to the product (not ad-hoc/custom).',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to add the product to (must be DRAFT)'),
        productId: z.string().describe('The product ID (from listProducts or getProduct)'),
        priceId: z.string().describe('The price ID (from getProduct result — ask user if multiple prices)'),
        quantity: z.number().optional().describe('Quantity (defaults to 1)'),
      }),
      execute: async (params) => {
        try {
          /** Step 1: Look up the product and validate the price belongs to it */
          let product: Awaited<ReturnType<typeof caller.products.getById>>
          try {
            product = await caller.products.getById({
              organizationId,
              productId: params.productId,
            })
          } catch {
            return {
              success: false,
              message: `Product not found: ${params.productId}`,
            }
          }

          const price = product.prices.find((p) => p.id === params.priceId)
          if (!price) {
            return {
              success: false,
              message: `Price ${params.priceId} not found on product "${product.name}". Available prices: ${product.prices.map((p) => `${p.name} (${p.id})`).join(', ')}`,
            }
          }

          /** Step 2: Fetch existing invoice items so we can append without replacing */
          let invoice: Awaited<ReturnType<typeof caller.invoices.getById>>
          try {
            invoice = await caller.invoices.getById({
              organizationId,
              id: params.invoiceId,
            })
          } catch {
            return { success: false, message: `Invoice not found: ${params.invoiceId}` }
          }

          if (invoice.status !== 'DRAFT') {
            return { success: false, message: `Cannot add items to a ${invoice.status} invoice — only DRAFT invoices can be modified` }
          }

          /** Build existing items array to preserve current items */
          const existingItems = invoice.items.map((item) => ({
            productId: item.productId,
            priceId: item.priceId,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            isAdHoc: item.isAdHoc,
            billingType: item.billingType,
            interval: item.interval,
            intervalCount: item.intervalCount,
          }))

          /** Create the new product-linked line item */
          const newItem = {
            productId: product.id,
            priceId: price.id,
            name: `${product.name} — ${price.name}`,
            description: null,
            quantity: params.quantity ?? 1,
            unitAmount: price.amount,
            isAdHoc: false,
            billingType: price.billingType,
            interval: price.interval,
            intervalCount: price.intervalCount,
          }

          /** Step 3: Sync all items (existing + new) atomically via tRPC */
          const updated = await caller.invoices.updateItems({
            invoiceId: params.invoiceId,
            organizationId,
            items: [...existingItems, newItem],
          })

          return {
            success: true,
            invoiceId: updated.id,
            invoiceNumber: updated.invoiceNumber,
            totalAmount: `$${(updated.totalAmount / 100).toFixed(2)}`,
            addedItem: `${newItem.name} ($${(newItem.unitAmount / 100).toFixed(2)} x ${newItem.quantity})`,
            message: `Added "${product.name}" (${price.name}) to invoice ${updated.invoiceNumber}`,
            /** Event bus: notify builders that line items changed */
            _event: { feature: 'invoice', action: 'items_changed', entityId: updated.id },
          }
        } catch (err) {
          return handleToolError('addProductToInvoice', err)
        }
      },
    }),

    /**
     * Set or change the lead/customer on an invoice.
     * Validates that the lead exists in the same organization BEFORE
     * updating the invoice — prevents foreign key constraint errors.
     * Works on DRAFT and SENT invoices.
     *
     * COMPOSITE TOOL: Chains two tRPC calls:
     * 1. `leads.getById` — validate lead exists in this org
     * 2. `invoices.update` — set the leadId on the invoice
     *
     * IMPORTANT: The leadId MUST come from a listLeads or getLead result.
     * Never create a new lead just to use as a recipient — always search
     * for the existing lead first.
     */
    setInvoiceRecipient: tool({
      description:
        'Set or change the lead/customer on an invoice. ' +
        'Use leadSearch (name or email) to find the lead automatically, ' +
        'or leadId only if you have a verified ID from a previous tool result. ' +
        'Works on DRAFT and SENT invoices.',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to set the recipient on'),
        leadSearch: z
          .string()
          .optional()
          .describe('Search for the lead by name or email. PREFERRED over leadId.'),
        leadId: z
          .string()
          .optional()
          .describe('Lead ID — ONLY if verified from a previous tool result. Prefer leadSearch.'),
      }),
      execute: async (params) => {
        try {
          /** Resolve lead — server-side lookup prevents fabricated IDs */
          const leadResult = await resolveLeadId(
            caller, organizationId, params.leadId, params.leadSearch
          )
          if (!leadResult || !leadResult.success) {
            return leadResult ?? {
              success: false as const,
              message: 'A lead is required to set as recipient. Provide leadSearch or leadId.',
              errorCode: 'VALIDATION_ERROR' as const,
            }
          }

          /** Update the invoice with the resolved lead ID via tRPC */
          const invoice = await caller.invoices.update({
            organizationId,
            id: params.invoiceId,
            leadId: leadResult.leadId,
          })

          return {
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            recipientName: leadResult.leadName,
            recipientEmail: leadResult.leadEmail,
            message: `Set recipient on invoice ${invoice.invoiceNumber} to ${leadResult.leadName} (${leadResult.leadEmail})`,
            /** Event bus: notify builders that recipient was set */
            _event: { feature: 'invoice', action: 'recipient_set', entityId: invoice.id },
          }
        } catch (err) {
          return handleToolError('setInvoiceRecipient', err)
        }
      },
    }),

    /**
     * Look up a lead's purchase history (transactions and payments).
     * Returns transaction details with full receipt URLs for each payment.
     * The receipt page has a built-in "Generate Invoice" button.
     * Routes through tRPC `transactions.getForLead` which enforces TRANSACTIONS_READ permission.
     */
    getReceiptForTransaction: tool({
      description:
        'Find all transactions and payment receipts for a lead/customer. ' +
        'Returns transaction history with full receipt URLs for each payment. ' +
        'Share the receiptUrl directly with the user — NEVER construct URLs yourself. ' +
        'The receipt page has a built-in "Generate Invoice" button.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to find transactions for'),
      }),
      execute: async (params) => {
        try {
          const transactions = await caller.transactions.getForLead({
            organizationId,
            leadId: params.leadId,
          })

          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

          if (transactions.length === 0) {
            return {
              success: true,
              transactions: [],
              message: 'No transactions found for this lead',
            }
          }

          /** Map transactions to a clean shape with amounts in dollars and full receipt URLs */
          const mapped = transactions.map((tx) => ({
            id: tx.id,
            /** Convert cents to dollar display format */
            originalAmount: `$${(tx.originalAmount / 100).toFixed(2)}`,
            currency: tx.currency,
            billingType: tx.billingType,
            paymentStatus: tx.paymentStatus,
            createdAt: tx.createdAt.toISOString(),
            items: tx.items.map((item) => ({
              productName: item.productName,
              priceName: item.priceName,
            })),
            /** Each payment has a full receipt URL — use these directly, NEVER construct URLs */
            payments: tx.payments.map((p) => ({
              id: p.id,
              /** Convert cents to dollar display format */
              amount: `$${(p.amount / 100).toFixed(2)}`,
              status: p.status,
              paymentNumber: p.paymentNumber,
              paidAt: p.paidAt?.toISOString() ?? null,
              /** Full receipt URL — give this directly to the user */
              receiptUrl: `${baseUrl}/receipt/${p.id}`,
            })),
          }))

          return {
            success: true,
            transactions: mapped,
            message: `Found ${transactions.length} transaction(s) with ${mapped.reduce((sum, tx) => sum + tx.payments.length, 0)} payment(s)`,
          }
        } catch (err) {
          return handleToolError('getReceiptForTransaction', err)
        }
      },
    }),

    /**
     * Mark an invoice as paid for offline/manual payments.
     * Only works on SENT or OVERDUE invoices.
     * Sets the status to PAID and records the current timestamp.
     * Routes through tRPC `invoices.markPaid` which enforces INVOICES_UPDATE permission.
     * NOTE: tRPC markPaid uses `id` (not `invoiceId`) and returns { success, invoiceId }.
     */
    markInvoicePaid: tool({
      description:
        'Mark an invoice as paid (for offline or manual payments). ' +
        'Only works on SENT or OVERDUE invoices. ' +
        'Sets the status to PAID with the current timestamp.',
      inputSchema: z.object({
        invoiceId: z.string().describe('The invoice ID to mark as paid'),
      }),
      execute: async (params) => {
        try {
          /** tRPC invoices.markPaid uses `id` (not `invoiceId`) */
          const result = await caller.invoices.markPaid({
            organizationId,
            id: params.invoiceId,
          })
          return {
            success: true,
            invoiceId: result.invoiceId,
            paidAt: new Date().toISOString(),
            message: `Marked invoice as paid`,
            /** Event bus: notify builders that invoice status changed to paid */
            _event: { feature: 'invoice', action: 'updated', entityId: result.invoiceId },
          }
        } catch (err) {
          return handleToolError('markInvoicePaid', err)
        }
      },
    }),
  }
}
