/**
 * Order Detail Page - Order Fulfillment Management
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in OrderDetailPage
 *
 * Displays detailed information about a single order including:
 * - Order items and totals
 * - Customer information
 * - Payment status
 * - Fulfillment status and tracking
 * - Order notes/timeline
 *
 * SOURCE OF TRUTH: Transaction (orders are transactions with fulfillment data)
 */

import { OrderDetailPage } from './_components/order-detail-page'

interface PageProps {
  params: Promise<{ orderId: string }>
}

export default async function OrderPage({ params }: PageProps) {
  const { orderId } = await params
  return <OrderDetailPage orderId={orderId} />
}
