/**
 * Orders Page - Order Fulfillment Management
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in OrdersTab
 *
 * Orders show all transactions with focus on fulfillment status,
 * tracking information, and order notes - inspired by Shopify's order management.
 *
 * SOURCE OF TRUTH: Transaction (orders are transactions with fulfillment data)
 */

import { OrdersTab } from './_components/orders-tab'

export default function OrdersPage() {
  return <OrdersTab />
}
