/**
 * Subscription Detail Page — Server Component Entry Point
 *
 * WHY: Minimal server component for instant navigation to subscription detail.
 * HOW: Extracts subscriptionId from params and delegates to SubscriptionDetailPage client component.
 *
 * The subscriptionId is actually a Transaction ID where billingType=RECURRING.
 * Subscriptions use the same Transaction model but get their own dedicated detail view.
 *
 * SOURCE OF TRUTH KEYWORDS: SubscriptionDetailPage, SubscriptionView
 */

import { SubscriptionDetailPage } from './_components/subscription-detail-page'

interface PageProps {
  params: Promise<{ subscriptionId: string }>
}

export default async function SubscriptionPage({ params }: PageProps) {
  const { subscriptionId } = await params
  return <SubscriptionDetailPage subscriptionId={subscriptionId} />
}
