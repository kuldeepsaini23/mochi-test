/**
 * Reset Password Page
 *
 * WHY: Allows users to set a new password after clicking the reset link
 * HOW: Renders the ResetPasswordForm component wrapped in Suspense.
 *      The token is read from URL search params (?token=xxx).
 *
 * NEXT.JS 16 REQUIREMENT: Components using useSearchParams() must be
 * wrapped in Suspense boundary for static generation compatibility.
 */

import { Suspense } from 'react'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default function ResetPasswordPage() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-md">
        <Suspense fallback={<ResetPasswordFormSkeleton />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Skeleton fallback for ResetPasswordForm during Suspense
 */
function ResetPasswordFormSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="h-8 w-56 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="grid gap-6">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
        <div className="h-10 w-full bg-muted rounded" />
      </div>
    </div>
  )
}
