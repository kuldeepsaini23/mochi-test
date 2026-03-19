/**
 * Unauthorized Access Page
 *
 * WHY: Displayed when a user tries to access a subdomain/custom domain
 *      they don't have permission to access.
 * HOW: The protected layout checks if the user is a member of the organization
 *      that owns the current subdomain/custom domain. If not, redirects here.
 *
 * SECURITY: This prevents cross-tenant access via shared cookies.
 *           Even though cookies work across subdomains (for UX), users can
 *           only access organizations they're actually members of.
 *
 * SMART REDIRECT: Fetches user's organizations and provides correct dashboard URL
 *                 pointing to their actual subdomain, not the current wrong one.
 */

'use client'

import { ShieldX, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { buildOrganizationUrl } from '@/lib/utils/domain-client'

export default function UnauthorizedPage() {
  // Fetch user's organizations to determine correct redirect URL
  const { data: accountsData, isLoading } = trpc.user.getAccounts.useQuery()

  /**
   * Build the correct dashboard URL for the user
   *
   * LOGIC:
   * 1. If user has organizations -> redirect to first org's subdomain
   * 2. If no organizations -> redirect to onboarding (they need to create one)
   *
   * NOTE: We use the first organization as default. In future, could remember
   *       user's last active org or let them choose from a dropdown.
   */
  const getDashboardUrl = (): string => {
    if (!accountsData?.accounts?.length) {
      // No organizations - send to onboarding to create one
      // Use root domain for onboarding
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'
      const isDevelopment = rootDomain.includes('localhost') || rootDomain.includes('.test')
      const port = isDevelopment ? ':3000' : ''
      const protocol = isDevelopment ? 'http' : 'https'
      return `${protocol}://${rootDomain}${port}/onboarding`
    }

    // Get first organization (could be enhanced to remember last active)
    const firstOrg = accountsData.accounts[0]

    // Build URL to user's organization subdomain using actual slug
    return buildOrganizationUrl(firstOrg.slug)
  }

  const handleGoToDashboard = () => {
    const url = getDashboardUrl()
    // Use window.location for cross-subdomain navigation
    window.location.href = url
  }

  const handleSignIn = () => {
    // Sign in should go to root domain
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochi.test'
    const isDevelopment = rootDomain.includes('localhost') || rootDomain.includes('.test')
    const port = isDevelopment ? ':3000' : ''
    const protocol = isDevelopment ? 'http' : 'https'
    window.location.href = `${protocol}://${rootDomain}${port}/sign-in`
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md text-center">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <ShieldX className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Access Denied
        </h1>

        {/* Description */}
        <p className="mb-8 text-muted-foreground">
          You don&apos;t have permission to access this organization.
          Please contact the organization owner if you believe this is a mistake.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="default"
            onClick={handleGoToDashboard}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Go to Dashboard'
            )}
          </Button>
          <Button variant="outline" onClick={handleSignIn}>
            Sign in with different account
          </Button>
        </div>
      </div>
    </div>
  )
}
