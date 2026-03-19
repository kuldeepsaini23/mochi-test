'use client'

/**
 * Wallet Tab Component
 *
 * WHY: Organization wallet management for usage-based billing
 * HOW: Displays wallet balance, payment method, and transaction history using real TRPC data
 *
 * WALLET SYSTEM:
 * - Auto top-up: Minimum $10 charged when balance drops below $0
 * - Manual top-up: Users can add funds manually (minimum $10)
 * - Transaction history: All charges and top-ups tracked
 * - Balance stored in MILLICENTS (1000 = $1.00) for sub-cent pricing accuracy
 *
 * SOURCE OF TRUTH: WalletTab, wallet.service.ts, walletRouter
 */

import { useState, useMemo, useCallback } from 'react'
import { WalletCard, type WalletPaymentMethod } from './wallet-card'
import {
  WalletTransactionsTable,
  type WalletTransaction,
  type WalletTransactionType,
} from './wallet-transactions-table'
import { TopUpDialog } from './top-up-dialog'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

export function WalletTab() {
  const [isTopUpOpen, setIsTopUpOpen] = useState(false)

  /**
   * Get active organization
   */
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  /**
   * Table state for pagination and filtering
   * Controlled locally but passed to server query
   */
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<WalletTransactionType | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  /**
   * Fetch wallet data (balance, settings)
   */
  const {
    data: walletData,
    isLoading: isLoadingWallet,
    refetch: refetchWallet,
  } = trpc.wallet.getWallet.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId,
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: true,
    }
  )

  /**
   * Fetch wallet transactions with server-side pagination and filtering
   */
  const {
    data: transactionsData,
    isLoading: isLoadingTransactions,
    isFetching: isFetchingTransactions,
    refetch: refetchTransactions,
  } = trpc.wallet.getTransactions.useQuery(
    {
      organizationId: organizationId!,
      page,
      pageSize,
      type: typeFilter,
      search: search || undefined,
    },
    {
      enabled: !!organizationId,
      staleTime: 10 * 1000, // 10 seconds
      refetchOnWindowFocus: true,
    }
  )

  /**
   * Fetch payment methods to get the default card
   * Uses the same query as billing page
   */
  const { data: paymentMethodsData, isLoading: isLoadingPaymentMethods } =
    trpc.payment.getPaymentMethods.useQuery(
      { organizationId: organizationId! },
      {
        enabled: !!organizationId,
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      }
    )

  /**
   * Top-up mutation
   */
  const topUpMutation = trpc.wallet.topUp.useMutation({
    onSuccess: () => {
      toast.success('Funds added successfully!')
      setIsTopUpOpen(false)
      // Refetch wallet and transactions to show updated data
      refetchWallet()
      refetchTransactions()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add funds')
    },
  })

  /**
   * Get the default payment method to display in the wallet card
   */
  const defaultPaymentMethod: WalletPaymentMethod | null = useMemo(() => {
    if (!paymentMethodsData) return null

    const defaultId = paymentMethodsData.defaultPaymentMethodId
    const methods = paymentMethodsData.paymentMethods || []

    const defaultMethod = methods.find((pm) => pm.id === defaultId)
    if (!defaultMethod) {
      // If no default, use first card
      const firstMethod = methods[0]
      if (firstMethod) {
        return { brand: firstMethod.brand ?? null, last4: firstMethod.last4 ?? '' }
      }
      return null
    }

    return { brand: defaultMethod.brand ?? null, last4: defaultMethod.last4 ?? '' }
  }, [paymentMethodsData])

  /**
   * Transform API transactions to component format
   * API returns dates as strings, need to convert to Date objects
   */
  const transactions: WalletTransaction[] = useMemo(() => {
    if (!transactionsData?.transactions) return []

    return transactionsData.transactions.map((t) => ({
      id: t.id,
      organizationId: organizationId || '',
      type: t.type as WalletTransactionType,
      status: t.status as 'PENDING' | 'COMPLETED' | 'FAILED',
      category: t.category,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      createdAt: new Date(t.createdAt),
      balanceAfter: t.balanceAfter,
      metadata: t.metadata ? JSON.parse(t.metadata) : undefined,
    }))
  }, [transactionsData, organizationId])

  /**
   * Handle top-up submission
   * Amount from dialog is in dollars, convert to millicents for API
   * WHY millicents: wallet uses millicents (1000 = $1.00) for sub-cent pricing accuracy
   */
  const handleTopUp = useCallback(
    async (amountInDollars: number) => {
      if (!organizationId) return

      // Convert dollars to millicents (1000 millicents = $1.00)
      const amountInMillicents = Math.round(amountInDollars * 1000)

      await topUpMutation.mutateAsync({
        organizationId,
        amount: amountInMillicents,
      })
    },
    [organizationId, topUpMutation]
  )

  /**
   * Handle search change - reset to page 1
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  /**
   * Handle type filter change - reset to page 1
   */
  const handleTypeFilterChange = useCallback((type: WalletTransactionType | undefined) => {
    setTypeFilter(type)
    setPage(1)
  }, [])

  /**
   * Handle page size change - reset to page 1
   */
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  /**
   * Calculate balance in dollars from millicents (1000 millicents = $1.00)
   */
  const balanceInDollars = walletData ? walletData.balance / 1000 : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Wallet</h2>
        <p className="text-muted-foreground">
          View your balance and transaction history.
        </p>
      </div>

      {/* Wallet Card - Self-contained with balance, actions, and info */}
      <WalletCard
        balance={balanceInDollars}
        currency={walletData?.currency || 'USD'}
        paymentMethod={defaultPaymentMethod}
        isLoading={isLoadingWallet || isLoadingPaymentMethods}
        onAddFunds={() => setIsTopUpOpen(true)}
      />

      {/* Transaction History */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Transactions</h3>
        <WalletTransactionsTable
          transactions={transactions}
          isLoading={isLoadingTransactions}
          isFetching={isFetchingTransactions}
          search={search}
          onSearchChange={handleSearchChange}
          typeFilter={typeFilter}
          onTypeFilterChange={handleTypeFilterChange}
          page={page}
          pageSize={pageSize}
          totalPages={transactionsData?.totalPages || 0}
          total={transactionsData?.total || 0}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Top-Up Dialog */}
      <TopUpDialog
        open={isTopUpOpen}
        onOpenChange={setIsTopUpOpen}
        onTopUp={handleTopUp}
        isLoading={topUpMutation.isPending}
      />
    </div>
  )
}
