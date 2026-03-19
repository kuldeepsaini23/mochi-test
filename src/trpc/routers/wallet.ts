/**
 * Wallet Router - Organization Wallet Management
 *
 * WHY: TRPC endpoints for wallet operations (balance, top-up, transactions)
 * HOW: Uses wallet.service.ts as single source of truth for all operations
 *
 * PERMISSIONS:
 * - Uses organizationProcedure for organization-scoped wallet operations
 * - VIEWING (getWallet, getTransactions): No permission required - all members can view
 * - MODIFYING (topUp, settings): Requires billing:update permission
 *
 * WHY NO PERMISSION FOR VIEWING:
 * - Wallet balance is not sensitive data
 * - All members should see org's financial health
 * - Prevents confusion about billing state
 * - Modification actions still protected
 *
 * SOURCE OF TRUTH: WalletRouter, wallet.service.ts
 */

import { createTRPCRouter } from '../init'
import { organizationProcedure } from '../procedures/organization'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'

/**
 * Zod schema for transaction type filter
 * SOURCE OF TRUTH: WalletTransactionTypeSchema
 */
const walletTransactionTypeSchema = z.enum(['TOP_UP', 'CHARGE', 'REFUND'])

export const walletRouter = createTRPCRouter({
  /**
   * Get wallet details for an organization
   * Includes balance, auto-top-up settings
   *
   * No permission required - all members can view wallet balance
   * WHY: Balance is not sensitive, members should see org's financial health
   */
  getWallet: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { getWalletWithDetails } = await import('@/services/wallet.service')

      const wallet = await getWalletWithDetails(input.organizationId)

      if (!wallet) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Wallet not found',
        })
      }

      return wallet
    }),

  /**
   * Get wallet transactions with pagination and filtering
   *
   * No permission required - all members can view transaction history
   * WHY: Transactions show org's activity, helps with transparency
   */
  getTransactions: organizationProcedure()
    .input(
      z.object({
        organizationId: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
        type: walletTransactionTypeSchema.optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { getTransactionsByOrganization } = await import('@/services/wallet.service')

      const result = await getTransactionsByOrganization(input.organizationId, {
        page: input.page,
        pageSize: input.pageSize,
        type: input.type,
        search: input.search,
      })

      return result
    }),

  /**
   * Manual top-up wallet
   * Creates a Stripe payment intent and adds funds
   * Requires: billing:update permission
   */
  topUp: organizationProcedure({ requirePermission: 'billing:update' })
    .input(
      z.object({
        organizationId: z.string(),
        amount: z.number().min(1000, 'Minimum top-up is $1'), // Amount in millicents (1000 = $1.00)
        paymentMethodId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { topUpWallet, BETA_TEST_MODE } = await import('@/services/wallet.service')

      /* Block manual top-ups during beta — users get $1 free credit only */
      if (BETA_TEST_MODE) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Top-ups are disabled while Mochi is in test mode.',
        })
      }

      try {
        const result = await topUpWallet({
          organizationId: input.organizationId,
          amount: input.amount,
          paymentMethodId: input.paymentMethodId,
        })

        return {
          success: true,
          transaction: {
            id: result.transaction.id,
            amount: result.transaction.amount,
            status: result.transaction.status,
            createdAt: result.transaction.createdAt,
          },
          newBalance: result.newBalance,
          clientSecret: result.clientSecret,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to top up wallet',
        })
      }
    }),

  /**
   * Update auto-top-up settings
   * Requires: billing:update permission
   */
  updateAutoTopUpSettings: organizationProcedure({ requirePermission: 'billing:update' })
    .input(
      z.object({
        organizationId: z.string(),
        autoTopUpEnabled: z.boolean().optional(),
        autoTopUpAmount: z.number().min(1000).optional(), // Minimum $1 in millicents
        autoTopUpThreshold: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { updateAutoTopUpSettings, BETA_TEST_MODE } = await import('@/services/wallet.service')

      /* Block auto-top-up settings changes during beta */
      if (BETA_TEST_MODE) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Auto top-up settings are disabled while Mochi is in test mode.',
        })
      }

      try {
        const wallet = await updateAutoTopUpSettings(input.organizationId, {
          autoTopUpEnabled: input.autoTopUpEnabled,
          autoTopUpAmount: input.autoTopUpAmount,
          autoTopUpThreshold: input.autoTopUpThreshold,
        })

        return {
          success: true,
          wallet: {
            id: wallet.id,
            autoTopUpEnabled: wallet.autoTopUpEnabled,
            autoTopUpAmount: wallet.autoTopUpAmount,
            autoTopUpThreshold: wallet.autoTopUpThreshold,
          },
        }
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to update settings',
        })
      }
    }),

  /**
   * Create wallet for organization (if not exists)
   * Usually called automatically, but exposed for manual creation
   * Requires: billing:update permission
   */
  createWallet: organizationProcedure({ requirePermission: 'billing:update' })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      const { createWallet, getWalletWithDetails } = await import('@/services/wallet.service')

      await createWallet(input.organizationId)
      const wallet = await getWalletWithDetails(input.organizationId)

      return { success: true, wallet }
    }),
})
