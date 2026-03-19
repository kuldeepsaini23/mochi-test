'use client'

/**
 * Subscription Canceled Banner
 *
 * WHY: Show destructive warning when user has canceled subscription
 * WHEN: Display when cancel_at_period_end is true (subscription canceled but still active)
 * WHERE: Top of studio layout, above all content
 *
 * This banner warns users that their subscription is canceled and will end at the period end date.
 * They can reactivate before the end date to continue service.
 */

import { AlertTriangle, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import Link from 'next/link'
import { useState } from 'react'

interface SubscriptionCanceledBannerProps {
  periodEnd: Date
  organizationId: string
}

export function SubscriptionCanceledBanner({
  periodEnd,
  organizationId,
}: SubscriptionCanceledBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) {
    return null
  }

  const formattedDate = format(periodEnd, 'MMMM d, yyyy')
  const daysUntilEnd = Math.ceil(
    (periodEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0 border-b border-destructive/50 bg-[rgb(223,89,89)] flex items-center justify-center absolute z-50"
    >
      <AlertTriangle className="text-white!" />
      <AlertTitle className="text-white">
        Subscription Canceled - {daysUntilEnd}{' '}
        {daysUntilEnd === 1 ? 'day' : 'days'} remaining Your subscription will
        end on{' '}
        <strong>{formattedDate}. All data will be permanently deleted.</strong>
        Reactivate to keep your account and data.
      </AlertTitle>
    </Alert>
  )
}
