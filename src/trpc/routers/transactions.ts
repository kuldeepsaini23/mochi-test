/**
 * Transactions Router
 *
 * tRPC router for transaction management.
 * Uses organizationProcedure for authorization.
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { TransactionPaymentStatus, PaymentStatus, BillingType } from '@/generated/prisma'
import * as transactionService from '@/services/transaction.service'
import { permissions } from '@/lib/better-auth/permissions'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const listTransactionsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  paymentStatus: z.array(z.nativeEnum(TransactionPaymentStatus)).optional(),
  /** Filter by billing type (ONE_TIME, RECURRING, SPLIT_PAYMENT) */
  billingType: z.nativeEnum(BillingType).optional(),
  leadId: z.string().optional(),
  productId: z.string().optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
})

export const getTransactionSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
})

/**
 * Update transaction schema (NEW ARCHITECTURE)
 *
 * Changed fields:
 * - status → paymentStatus
 * - completedPayments → successfulPayments
 * - completedAt → fullyPaidAt
 *
 * Removed fields:
 * - nextPaymentDate (not needed, Stripe handles scheduling)
 *
 * New fields:
 * - paidAmount, firstPaidAt, lastPaidAt
 */
export const updateTransactionSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
  paymentStatus: z.nativeEnum(TransactionPaymentStatus).optional(),
  paidAmount: z.number().int().optional(),
  successfulPayments: z.number().int().optional(),
  firstPaidAt: z.date().nullable().optional(),
  lastPaidAt: z.date().nullable().optional(),
  fullyPaidAt: z.date().nullable().optional(),
  canceledAt: z.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const cancelTransactionSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
})

export const cancelSubscriptionSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
})

/**
 * Record payment schema (NEW ARCHITECTURE)
 *
 * Removed: dueDate (not needed)
 * Added: stripeChargeId (for refund tracking)
 */
export const recordPaymentSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
  amount: z.number().int().positive(),
  currency: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  paymentNumber: z.number().int().positive(),
  stripePaymentIntentId: z.string().optional(),
  stripeInvoiceId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  paidAt: z.date().optional(),
  failedAt: z.date().optional(),
  failureReason: z.string().optional(),
})

export const getTransactionsForLeadSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
})

export const refundTransactionSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
  amount: z
    .number()
    .int()
    .positive({ message: 'Refund amount must be greater than $0' })
    .optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
})

export const refundPaymentSchema = z.object({
  organizationId: z.string(),
  transactionId: z.string(),
  paymentId: z.string(),
  amount: z
    .number()
    .int()
    .positive({ message: 'Refund amount must be greater than $0' })
    .optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const transactionsRouter = createTRPCRouter({
  /**
   * List all transactions with pagination and filters
   */
  list: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(listTransactionsSchema)
    .query(async ({ input }) => {
      return await transactionService.listTransactions({
        organizationId: input.organizationId,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
        paymentStatus: input.paymentStatus,
        billingType: input.billingType,
        leadId: input.leadId,
        productId: input.productId,
        fromDate: input.fromDate,
        toDate: input.toDate,
      })
    }),

  /**
   * Get a single transaction by ID
   */
  getById: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(getTransactionSchema)
    .query(async ({ input }) => {
      const transaction = await transactionService.getTransactionById(
        input.organizationId,
        input.transactionId
      )

      if (!transaction) {
        throw createStructuredError('NOT_FOUND', 'Transaction not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Transaction not found',
        })
      }

      return transaction
    }),

  /**
   * Update a transaction
   */
  update: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(updateTransactionSchema)
    .mutation(async ({ input }) => {
      const { organizationId, transactionId, ...data } = input
      return await transactionService.updateTransaction(organizationId, transactionId, data)
    }),

  /**
   * Cancel a transaction
   */
  cancel: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_CANCEL })
    .input(cancelTransactionSchema)
    .mutation(async ({ input }) => {
      await transactionService.cancelTransaction(input.organizationId, input.transactionId)
      return { success: true, message: 'Transaction canceled' }
    }),

  /**
   * Cancel a subscription (RECURRING or SPLIT_PAYMENT)
   * Cancels the Stripe subscription and updates transaction status
   */
  cancelSubscription: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_CANCEL })
    .input(cancelSubscriptionSchema)
    .mutation(async ({ input }) => {
      await transactionService.cancelSubscription(input.organizationId, input.transactionId)
      return { success: true, message: 'Subscription canceled' }
    }),

  /**
   * Record a payment for a transaction (for installments)
   */
  recordPayment: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_UPDATE })
    .input(recordPaymentSchema)
    .mutation(async ({ input }) => {
      const { organizationId, transactionId, ...payment } = input
      return await transactionService.recordPayment(organizationId, transactionId, payment)
    }),

  /**
   * Get transaction statistics
   */
  getStats: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      return await transactionService.getTransactionStats(input.organizationId)
    }),

  /**
   * Get all transactions for a specific lead
   */
  getForLead: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(getTransactionsForLeadSchema)
    .query(async ({ input }) => {
      return await transactionService.getTransactionsForLead(
        input.organizationId,
        input.leadId
      )
    }),

  /**
   * Get transactions for a lead with cursor-based infinite scroll.
   * Returns paginated items + nextCursor for the LoadMoreTrigger pattern.
   */
  getForLeadInfinite: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        leadId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ input }) => {
      return await transactionService.getTransactionsForLeadPaginated(
        input.organizationId,
        input.leadId,
        input.limit,
        input.cursor
      )
    }),

  /**
   * Refund an entire transaction (for ONE_TIME payments)
   *
   * NEW ARCHITECTURE:
   * - Validates against paidAmount (actual money received)
   * - Can refund partially refunded transactions (checks remaining amount)
   */
  refundTransaction: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_REFUND })
    .input(refundTransactionSchema)
    .mutation(async ({ input }) => {
      // Validate refund amount doesn't exceed transaction paid amount
      const transaction = await transactionService.getTransactionById(
        input.organizationId,
        input.transactionId
      )

      if (!transaction) {
        throw createStructuredError('NOT_FOUND', 'Transaction not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Transaction not found',
        })
      }

      // Calculate remaining refundable amount
      const refundableAmount = transaction.paidAmount - transaction.refundedAmount

      if (input.amount && input.amount > refundableAmount) {
        throw createStructuredError('BAD_REQUEST', 'Refund amount exceeds refundable amount', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `Refund amount ($${input.amount / 100}) cannot exceed remaining refundable amount ($${refundableAmount / 100})`,
        })
      }

      if (input.amount === 0) {
        throw createStructuredError('BAD_REQUEST', 'Refund amount cannot be $0', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Refund amount must be greater than $0',
        })
      }

      await transactionService.refundTransaction(
        input.organizationId,
        input.transactionId,
        input.amount,
        input.reason
      )
      return { success: true, message: 'Refund initiated successfully' }
    }),

  /**
   * Refund a specific payment in a subscription/installment plan
   *
   * NEW ARCHITECTURE:
   * - Validates against remaining refundable amount (payment.amount - payment.refundedAmount)
   * - Supports multiple partial refunds on same payment
   */
  refundPayment: organizationProcedure({ requirePermission: permissions.TRANSACTIONS_REFUND })
    .input(refundPaymentSchema)
    .mutation(async ({ input }) => {
      // Get transaction with payments to validate refund amount
      const transaction = await transactionService.getTransactionById(
        input.organizationId,
        input.transactionId
      )

      if (!transaction) {
        throw createStructuredError('NOT_FOUND', 'Transaction not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Transaction not found',
        })
      }

      const payment = transaction.payments.find((p) => p.id === input.paymentId)

      if (!payment) {
        throw createStructuredError('NOT_FOUND', 'Payment not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Payment not found',
        })
      }

      // Calculate remaining refundable amount for this payment
      const refundableAmount = payment.amount - payment.refundedAmount

      if (input.amount && input.amount > refundableAmount) {
        throw createStructuredError('BAD_REQUEST', 'Refund amount exceeds refundable amount', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `Refund amount ($${input.amount / 100}) cannot exceed remaining refundable amount ($${refundableAmount / 100})`,
        })
      }

      if (input.amount === 0) {
        throw createStructuredError('BAD_REQUEST', 'Refund amount cannot be $0', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Refund amount must be greater than $0',
        })
      }

      await transactionService.refundPayment(
        input.organizationId,
        input.transactionId,
        input.paymentId,
        input.amount,
        input.reason
      )
      return { success: true, message: 'Payment refund initiated successfully' }
    }),

  // ==========================================================================
  // PUBLIC RECEIPT ENDPOINT
  // ==========================================================================

  /**
   * Get public receipt data by payment ID.
   *
   * PUBLIC ENDPOINT — No auth required. Payment ID (CUID) is the security.
   * Uses baseProcedure (not organizationProcedure).
   *
   * WHY: Allow customers to view payment receipts via shareable public links.
   * SECURITY: CUID has 128-bit cryptographic randomness — effectively unguessable.
   * Only returns data for SUCCEEDED payments (no info leakage on pending/failed).
   */
  getPaymentReceipt: baseProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const receipt = await transactionService.getPublicReceiptData(input.paymentId)

      if (!receipt) {
        throw createStructuredError('NOT_FOUND', 'Receipt not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Payment receipt not found or not available',
        })
      }

      return receipt
    }),

  /**
   * Get receipt data by transaction ID.
   *
   * PUBLIC ENDPOINT — No auth required. Transaction ID (CUID) is the security.
   * Uses baseProcedure (not organizationProcedure).
   *
   * WHY: The receipt element on published website pages fetches receipt data
   * using the transactionId from URL search params. This endpoint resolves
   * the LATEST SUCCEEDED payment for the given transaction so customers
   * always see their most recent payment receipt.
   *
   * SECURITY:
   * - Transaction IDs are CUIDs with 128-bit cryptographic randomness — unguessable
   * - Only returns data for SUCCEEDED payments (no info leakage on pending/failed)
   * - Zero PII in output (no emails, phones, names, Stripe IDs)
   * - Returns null → NOT_FOUND if webhook is still pending
   */
  getReceiptByTransaction: baseProcedure
    .input(z.object({ transactionId: z.string().min(1) }))
    .query(async ({ input }) => {
      const receipt = await transactionService.getReceiptByTransaction(
        input.transactionId
      )

      if (!receipt) {
        throw createStructuredError('NOT_FOUND', 'Receipt not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message:
            'Transaction receipt not found or payment has not been processed yet',
        })
      }

      return receipt
    }),
})
