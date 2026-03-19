/**
 * Forgot Password Page
 *
 * WHY: Allows users to request a password reset email
 * HOW: Renders the ForgotPasswordForm component wrapped in Suspense
 *
 * NEXT.JS 16 REQUIREMENT: Components using useSearchParams() must be
 * wrapped in Suspense boundary for static generation compatibility.
 */

import { Suspense } from 'react'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md">
        <Suspense fallback={<ForgotPasswordFormSkeleton />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Skeleton fallback for ForgotPasswordForm during Suspense
 */
function ForgotPasswordFormSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="h-8 w-56 bg-muted rounded" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="grid gap-6">
        <div className="space-y-2">
          <div className="h-4 w-12 bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
        <div className="h-10 w-full bg-muted rounded" />
      </div>
    </div>
  )
}
