/**
 * Auth Layout
 *
 * WHY: Shared layout for authentication pages (sign-in, sign-up, etc.)
 * HOW: Checks for an active session — if the user is already signed in,
 *      redirects them to the dashboard instead of showing auth forms.
 *      Otherwise renders auth pages normally (no auth required to view them).
 */

import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/better-auth/auth'
import { PlatformLogo } from '@/components/global/platform-logo'
import { AffiliateTracker } from '@/components/affiliate-tracker'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /**
   * If the user already has an active session, redirect them to the dashboard.
   * No reason for a signed-in user to see sign-in/sign-up pages.
   */
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session?.user) {
    redirect('/')
  }
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <Suspense fallback={null}>
        <AffiliateTracker />
      </Suspense>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="self-center">
          <PlatformLogo href="/" />
        </div>
        {children}
      </div>
    </div>
  )
}
