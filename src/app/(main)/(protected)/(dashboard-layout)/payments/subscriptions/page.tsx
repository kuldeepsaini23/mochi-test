/**
 * Subscriptions Page - Filtered View of Recurring Transactions
 *
 * WHY: Dedicated view for managing recurring subscriptions separately from one-time payments
 * HOW: Minimal server component, all data fetching handled client-side in SubscriptionsTab
 *
 * Subscriptions show all RECURRING transactions with subscription-specific columns
 * like trial info, interval-based pricing, and subscription lifecycle status.
 */

import { SubscriptionsTab } from './_components/subscriptions-tab'

export default function SubscriptionsPage() {
  return <SubscriptionsTab />
}
