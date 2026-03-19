/**
 * Forgot Password Form Component
 *
 * WHY: Allows users to request a password reset email
 * HOW: Uses Better Auth client's forgetPassword method which hits
 *      POST /api/auth/request-password-reset. The server generates a
 *      token and calls our sendResetPassword callback to email the user.
 *
 * SECURITY: Always shows "Check your email" on success regardless of
 * whether the email exists. This prevents email enumeration attacks.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { authClient } from '@/lib/better-auth/auth-client'
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
import { MailCheck } from 'lucide-react'

const forgotPasswordSchema = z.object({
  email: z.string().email({
    message: 'Please enter a valid email address',
  }),
})

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  async function onSubmit(values: ForgotPasswordValues) {
    setError('')
    setLoading(true)

    try {
      /**
       * Call Better Auth's request-password-reset endpoint directly via $fetch.
       * WHY $fetch: The emailOTPClient plugin overrides the forgetPassword type,
       * making it non-callable in TypeScript. Using $fetch bypasses this.
       *
       * redirectTo tells Better Auth where the reset link callback should redirect.
       * Better Auth appends ?token=xxx to this URL after validating the reset token.
       */
      const { error: authError } = await authClient.$fetch(
        '/request-password-reset',
        {
          method: 'POST',
          body: { email: values.email, redirectTo: '/reset-password' },
        }
      )

      if (authError) {
        setError(authError.message || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      // Always show success regardless of whether email exists (prevents enumeration)
      setEmailSent(true)
    } catch (err) {
      console.error('Forgot password error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Success state — email has been sent
  if (emailSent) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground text-sm text-balance">
            If an account exists with that email address, we&apos;ve sent you a link
            to reset your password. Please check your inbox and spam folder.
          </p>
        </div>

        <div className="text-center text-sm">
          <Link
            href="/sign-in"
            className="underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="m@example.com"
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
            {loading ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>
      </Form>

      <div className="text-center text-sm">
        Remember your password?{' '}
        <Link
          href="/sign-in"
          className="underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
