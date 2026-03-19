/**
 * Payments Layout - Active Organization Pattern
 *
 * WHY: Shared layout for all payments pages (Products, Contracts, Invoices)
 * HOW: Provides consistent page structure with navigation tabs
 *
 * ARCHITECTURE:
 * - Uses getActiveOrganization for server-side org context
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Uses ContentLayout for consistent structure
 * - PaymentsNav for tab navigation between sections
 * - Each child page handles its own content and permissions
 * - Shows alert if Stripe is not connected
 */

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { ContentLayout } from '@/components/global/content-layout'
import { PaymentsNav } from './_components/payments-nav'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'

export default async function PaymentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  /**
   * Get active organization using the proper server-side pattern
   * This uses getActiveOrganization which respects domain-first approach
   */
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  const isStripeConnected = !!activeOrg?.stripeConnectedAccountId

  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Stripe Connection Alert */}
        {!isStripeConnected && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>
              Connect your Stripe account to accept payments.{' '}
              <Link
                href="/settings/integrations"
                className="font-medium underline underline-offset-4 hover:no-underline"
              >
                Go to Integrations
              </Link>
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        <PaymentsNav />

        {/* Child pages */}
        {children}
      </div>
    </ContentLayout>
  )
}
