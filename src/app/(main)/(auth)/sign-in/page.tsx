/**
 * Sign In Page
 *
 * WHY: Public page for users to sign in
 * HOW: Renders the SignInForm component wrapped in Suspense
 *
 * NEXT.JS 16 REQUIREMENT: Components using useSearchParams() must be
 * wrapped in Suspense boundary for static generation compatibility.
 */

import { Suspense } from 'react'
import { SignInForm } from '@/components/auth/sign-in-form'

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md">
        <Suspense fallback={<SignInFormSkeleton />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Skeleton fallback for SignInForm during Suspense
 */
function SignInFormSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="grid gap-6">
        <div className="space-y-2">
          <div className="h-4 w-12 bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
        <div className="h-10 w-full bg-muted rounded" />
      </div>
    </div>
  )
}
