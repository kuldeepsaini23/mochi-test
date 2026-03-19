/**
 * Invitation Email Mismatch Component
 *
 * WHY: Displayed when logged-in user's email doesn't match the invitation email
 * HOW: Shows clear error message with options to sign out or go back
 *
 * SECURITY: Prevents users from accepting invitations meant for others
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/better-auth/auth-client'
import { Button } from '@/components/ui/button'
import { AlertCircle, LogOut, ArrowLeft } from 'lucide-react'

interface InvitationEmailMismatchProps {
  /** The email of the currently logged-in user */
  currentEmail: string
  /** The email the invitation was sent to */
  invitedEmail: string
  /** Name of the organization sending the invitation */
  organizationName: string
  /** Invitation ID for redirect after sign-out */
  invitationId: string
}

export function InvitationEmailMismatch({
  currentEmail,
  invitedEmail,
  organizationName,
  invitationId,
}: InvitationEmailMismatchProps) {
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  /**
   * Sign out and redirect back to accept invitation
   * The accept-invitation page will then redirect to sign-up with correct email
   */
  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await authClient.signOut()
      // Redirect back to accept-invitation to restart the flow
      window.location.href = `/accept-invitation?id=${invitationId}`
    } catch (error) {
      console.error('Sign out failed:', error)
      setSigningOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto">
      {/* Error Header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Email Mismatch</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;re signed in with a different email than the one this invitation was sent to.
        </p>
      </div>

      {/* Email Comparison Card */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Invitation sent to
            </p>
            <p className="font-medium text-sm mt-1">{invitedEmail}</p>
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            You&apos;re signed in as
          </p>
          <p className="font-medium text-sm mt-1">{currentEmail}</p>
        </div>
      </div>

      {/* Organization Info */}
      <p className="text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{organizationName}</span> invited{' '}
        <span className="font-medium text-foreground">{invitedEmail}</span> to join their team.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full"
        >
          {signingOut ? (
            'Signing out...'
          ) : (
            <>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out and continue as {invitedEmail.split('@')[0]}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="w-full"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go to Dashboard
        </Button>
      </div>

      {/* Help Text */}
      <p className="text-xs text-center text-muted-foreground">
        If you believe this is an error, please contact the organization admin to send a new
        invitation to your email address.
      </p>
    </div>
  )
}
