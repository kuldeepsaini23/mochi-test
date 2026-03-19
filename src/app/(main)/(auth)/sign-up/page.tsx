/**
 * Sign Up Page
 *
 * WHY: Public page for users to create an account
 * HOW: Renders the SignUpForm component wrapped in Suspense
 *
 * NEXT.JS 16 REQUIREMENT: Components using useSearchParams() must be
 * wrapped in Suspense boundary for static generation compatibility.
 */

import { Suspense } from 'react'
import { SignUpForm } from '@/components/auth/sign-up-form'

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md">
        <Suspense fallback={<SignUpFormSkeleton />}>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Skeleton fallback for SignUpForm during Suspense
 */
function SignUpFormSkeleton() {
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
