/**
 * Transaction Detail Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in TransactionDetailPage
 *
 * Displays detailed information about a single transaction including payment
 * history, customer information, and refund/cancel capabilities.
 */

import { TransactionDetailPage } from './_components/transaction-detail-page'

interface PageProps {
  params: Promise<{ transactionId: string }>
}

export default async function TransactionPage({ params }: PageProps) {
  const { transactionId } = await params
  return <TransactionDetailPage transactionId={transactionId} />
}
