/**
 * Reset Password Form Component
 *
 * WHY: Allows users to set a new password using the token from their email
 * HOW: Reads the token from URL search params, validates new password + confirm,
 *      then calls Better Auth's resetPassword endpoint. On success, redirects
 *      to /sign-in with a success banner.
 *
 * TOKEN: Better Auth appends ?token=xxx to the redirectTo URL when
 *        the user clicks the reset link in their email.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import { AlertTriangle } from 'lucide-react'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, {
      message: 'Password must be at least 8 characters',
    }),
    confirmPassword: z.string().min(1, {
      message: 'Please confirm your password',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  // Token from the reset link email (Better Auth appends ?token=xxx)
  const token = searchParams.get('token')

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) return

    setError('')
    setLoading(true)

    try {
      /**
       * Call Better Auth's reset-password endpoint directly via $fetch.
       * WHY $fetch: The emailOTPClient plugin overrides resetPassword type,
       * making direct calls fail TypeScript checks. Using $fetch bypasses this.
       *
       * Sends the new password + token to POST /api/auth/reset-password
       */
      const { error: authError } = await authClient.$fetch(
        '/reset-password',
        {
          method: 'POST',
          body: { newPassword: values.password, token },
        }
      )

      if (authError) {
        setError(authError.message || 'Failed to reset password. The link may have expired.')
        setLoading(false)
        return
      }

      // Redirect to sign-in with success message
      window.location.href = '/sign-in?reset=success'
    } catch (err) {
      console.error('Reset password error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  // No token in URL — invalid or expired link
  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Invalid reset link</h1>
          <p className="text-muted-foreground text-sm text-balance">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>

        <div className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter your new password below.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 text-sm">
          {error}
          {/* Show link to try again when token might be expired */}
          <Link
            href="/forgot-password"
            className="block mt-2 underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-6"
        >
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter your new password"
                    disabled={loading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Confirm your new password"
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
            {loading ? 'Resetting...' : 'Reset password'}
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
