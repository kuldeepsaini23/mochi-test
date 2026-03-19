/**
 * Transactions Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in TransactionsTab
 *
 * Transactions show all payment records for the organization including
 * one-time, recurring, and installment payments with customer details.
 */

import { TransactionsTab } from './_components/transactions-tab'

export default function TransactionsPage() {
  return <TransactionsTab />
}
