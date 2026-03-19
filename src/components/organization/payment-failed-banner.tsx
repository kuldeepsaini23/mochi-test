'use client'

/**
 * Payment Failed Banner
 *
 * WHY: Show urgent warning when subscription payment has failed
 * WHEN: Display when subscription status is 'past_due' (payment failed, Stripe retrying)
 * WHERE: Top of studio layout, above all content
 *
 * STRIPE STATUS FLOW:
 * - active → past_due (payment failed, Stripe auto-retries for ~2 weeks)
 * - past_due → unpaid (all retries exhausted) OR active (payment succeeds)
 * - unpaid/canceled → subscription.deleted → we delete all data
 *
 * This banner shows during the 'past_due' grace period while Stripe retries payments.
 */

import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface PaymentFailedBannerProps {
  organizationId: string
  attemptCount?: number
  nextRetryDate?: Date
}

export function PaymentFailedBanner({
  organizationId,
  attemptCount = 1,
  nextRetryDate,
}: PaymentFailedBannerProps) {
  const retryMessage = nextRetryDate
    ? `Next retry: ${nextRetryDate.toLocaleDateString()}`
    : 'Stripe will retry automatically'

  return (
    <Alert
      variant="default"
      className="rounded-none border-x-0  border-orange-500/50 dark:bg-orange-500 bg-[#e88738] flex items-center justify-center absolute z-50"
    >
      <AlertTriangle className="text-white!" />
      <AlertTitle className="text-white">
        Payment Failed - Immediate Action Required
      </AlertTitle>
      <AlertDescription className="text-white/90 flex items-center gap-4">
        <span>
          Your payment method was declined.{' '}
          {retryMessage.replace('Stripe', 'We')}.
          <strong className="ml-2">
            If the next attempt fails, your account will be permanently deleted.
          </strong>
        </span>
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="shrink-0 bg-white text-orange-600 hover:bg-white/90"
        >
          <Link href="/settings/billing">Update Payment Method</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
