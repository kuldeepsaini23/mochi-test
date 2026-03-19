/**
 * Sign In Form Component
 *
 * WHY: Provides UI for users to sign in with email and password
 * HOW: Uses Better Auth client directly for authentication
 *
 * INVITATION FLOW:
 * - When invitationId is present, email comes from URL params (locked)
 * - sign-up page passes: invitationId, email, org
 * - Email field is read-only to prevent signing in with wrong account
 *
 * PERFORMANCE: After successful sign-in, redirects directly to dashboard.
 *              The protected layout handles org check - no DB queries needed here.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { authClient } from '@/lib/better-auth/auth-client'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { trpc } from '@/trpc/react-provider'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { AppLoadingSkeleton } from '@/components/global/app-loading-skeleton'
import { Lock, Building2, CheckCircle2 } from 'lucide-react'

const loginFormSchema = z.object({
  email: z.string().email({
    message: 'Please enter a valid email address',
  }),
  password: z.string().min(1, {
    message: 'Password is required',
  }),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

export function SignInForm() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const searchParams = useSearchParams()

  // Invitation context from URL params
  const invitationId = searchParams.get('invitationId')
  const invitedEmail = searchParams.get('email')
  const organizationName = searchParams.get('org')

  // Password reset success — shown when redirected from /reset-password
  const resetSuccess = searchParams.get('reset') === 'success'

  // If invitation context exists, email is locked
  const isEmailLocked = Boolean(invitationId && invitedEmail)

  /**
   * Portal Admin Check Mutation
   * WHY: After successful sign-in, check if user is a portal admin
   * HOW: If they are, redirect to /portal instead of dashboard
   * SECURITY: This also auto-creates the initial owner if conditions match
   */
  const checkPortalAdmin = trpc.portal.checkPortalAdminStatus.useMutation()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: invitedEmail || '',
      password: '',
    },
  })

  // Update email field when invitedEmail changes (URL param)
  useEffect(() => {
    if (invitedEmail) {
      form.setValue('email', invitedEmail)
    }
  }, [invitedEmail, form])

  async function onSubmit(values: LoginFormValues) {
    setError('')
    setLoading(true)

    // SECURITY: If invitation context exists, ensure email matches
    if (isEmailLocked && values.email.toLowerCase() !== invitedEmail?.toLowerCase()) {
      setError('You can only sign in with the email address the invitation was sent to.')
      setLoading(false)
      return
    }

    try {
      // Use Better Auth client directly (follows v2 architecture pattern)
      const { error: authError } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })

      if (authError) {
        setError(authError.message || 'Failed to sign in')
        setLoading(false)
        return
      }

      // Fire Clarity analytics event (non-blocking)
      trackEvent(CLARITY_EVENTS.SIGN_IN)

      // Show loading skeleton before redirect
      setRedirecting(true)

      /**
       * Wait for session cookie to be fully set before making authenticated requests.
       * WHY: Better Auth's signIn.email() returns success with a Set-Cookie header,
       * but the browser may not have processed the cookie by the time the next
       * fetch fires. This causes a race condition where the TRPC mutation sends
       * stale/missing cookies → 401 UNAUTHORIZED.
       * HOW: Poll getSession() until it returns a valid session, confirming the
       * cookie is usable. Max 10 attempts (2.5s) before falling through.
       */
      const maxRetries = 10
      for (let i = 0; i < maxRetries; i++) {
        const { data: sessionData } = await authClient.getSession()
        if (sessionData?.session) break
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      // If there's an invitation ID, redirect to accept-invitation
      if (invitationId) {
        window.location.href = `/accept-invitation?id=${invitationId}`
        return
      }

      // Check if user is a portal admin (also auto-creates initial owner if conditions match)
      // This runs AFTER successful auth so we have a valid session
      try {
        const portalStatus = await checkPortalAdmin.mutateAsync()

        if (portalStatus.isPortalAdmin) {
          // Portal admin - redirect to portal dashboard
          // This skips the onboarding flow entirely
          window.location.href = '/portal'
          return
        }
      } catch (portalError) {
        // Non-blocking - if portal check fails, just continue to normal flow
        console.error('Portal check failed:', portalError)
      }

      // PERFORMANCE: Redirect directly to dashboard
      // The protected layout will handle the org check and redirect to onboarding if needed
      // This avoids 2-4+ database queries on the sign-in page
      window.location.href = '/'
    } catch (err) {
      console.error('Sign in error:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  // Show full-screen loading skeleton while redirecting to dashboard
  if (redirecting) {
    return <AppLoadingSkeleton />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {isEmailLocked
            ? `Sign in to join ${organizationName || 'the organization'}`
            : 'Enter your email below to login to your account'}
        </p>
      </div>

      {/* Invitation Banner - shown when accepting invitation */}
      {isEmailLocked && organizationName && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">You&apos;ve been invited to join</p>
            <p className="text-primary font-semibold">{organizationName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in to accept the invitation
            </p>
          </div>
        </div>
      )}

      {/* Password reset success banner */}
      {resetSuccess && (
        <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-md p-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Password reset successfully. Sign in with your new password.
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-6"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email
                  {isEmailLocked && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Locked to invitation
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="m@example.com"
                      disabled={loading || isEmailLocked}
                      readOnly={isEmailLocked}
                      className={isEmailLocked ? 'pr-10 bg-muted/50' : ''}
                      {...field}
                    />
                    {isEmailLocked && (
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </FormControl>
                {isEmailLocked && (
                  <p className="text-xs text-muted-foreground">
                    This is the email address the invitation was sent to.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading
              ? 'Signing in...'
              : isEmailLocked
                ? 'Sign in & accept invitation'
                : 'Login'}
          </Button>
          <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
            <span className="bg-background text-muted-foreground relative z-10 px-2">
              Or continue with
            </span>
          </div>
          <Button
            variant="outline"
            className="w-full"
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="size-4"
            >
              <path
                d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                fill="currentColor"
              />
            </svg>
            Login with Google
          </Button>
        </form>
      </Form>

      <div className="text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link
          href={
            invitationId
              ? `/sign-up?invitationId=${invitationId}${invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''}${organizationName ? `&org=${encodeURIComponent(organizationName)}` : ''}`
              : '/sign-up'
          }
          className="underline underline-offset-4"
        >
          Sign up
        </Link>
      </div>
    </div>
  )
}
