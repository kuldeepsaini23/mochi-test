'use client'

/**
 * Stripe Account Restricted Banner
 *
 * WHY: Show urgent warning when connected Stripe account has restrictions
 * WHEN: Display when account has requirements.past_due or requirements.currently_due
 * WHERE: Top of studio layout, above all content
 *
 * This banner shows when Stripe needs additional information from the connected account.
 * If not resolved, the account may be disabled and unable to accept payments.
 */

import { AlertTriangle } from 'lucide-react'
import { Alert, AlertTitle } from '@/components/ui/alert'

interface StripeAccountRestrictedBannerProps {
  dashboardUrl: string
}

export function StripeAccountRestrictedBanner({
  dashboardUrl,
}: StripeAccountRestrictedBannerProps) {
  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0 border-b border-destructive/50 bg-[rgb(223,89,89)] flex items-center justify-center absolute z-50"
    >
      <AlertTriangle className="text-white!" />
      <AlertTitle className="text-white">
        Stripe Account Action Required - Your Stripe account has missing or outdated information.{' '}
        <strong>Resolve this immediately to avoid payment disruptions.</strong>{' '}
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          Fix in Stripe Dashboard
        </a>
      </AlertTitle>
    </Alert>
  )
}
