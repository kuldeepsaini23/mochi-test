/**
 * Accept Invitation Page (Server Component)
 *
 * WHY: Handle invitation acceptance server-side with proper email validation
 * HOW: Fetch invitation, validate email match, accept via Better Auth, redirect
 *
 * FLOW:
 * 1. Fetch invitation details to get invited email
 * 2. No auth + user exists → redirect to /sign-in with email locked
 * 3. No auth + user doesn't exist → redirect to /sign-up with email locked
 * 4. Authenticated but wrong email → show error with sign-out option
 * 5. Authenticated + email matches → accept invitation → redirect to dashboard
 *
 * SECURITY:
 * - Users can ONLY accept invitations sent to their email
 * - Cannot sign up/sign in with different email than invited
 * - Prevents unauthorized org access
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/better-auth/auth'
import { headers } from 'next/headers'
import { prisma } from '@/lib/config'
import { InvitationEmailMismatch } from '@/components/auth/invitation-email-mismatch'
import { initializeMemberAvailability } from '@/services/member-availability.service'

type PageProps = {
  searchParams: Promise<{ id?: string }>
}

export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  const params = await searchParams
  const invitationId = params.id

  // No invitation ID - redirect to sign-up
  if (!invitationId) {
    redirect('/sign-up')
  }

  // ============================================================================
  // STEP 1: Fetch invitation details to validate email
  // ============================================================================

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  // Invitation not found - redirect to sign-up
  if (!invitation) {
    redirect('/sign-up?error=invitation_not_found')
  }

  // Invitation expired - redirect to sign-up with error
  if (invitation.expiresAt < new Date()) {
    redirect('/sign-up?error=invitation_expired')
  }

  // Invitation already used - redirect to sign-up with error
  if (invitation.status !== 'pending') {
    redirect(
      `/sign-up?error=invitation_${invitation.status === 'accepted' ? 'already_accepted' : 'cancelled'}`
    )
  }

  // ============================================================================
  // STEP 2: Check authentication status
  // ============================================================================

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  // ============================================================================
  // STEP 3: Not authenticated - check if user exists and redirect accordingly
  // ============================================================================

  if (!session?.user) {
    // Check if a user with the invited email already exists in the system
    // WHY: Existing users should sign in, not sign up (prevents "user already exists" errors)
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email.toLowerCase() },
      select: { id: true },
    })

    // Build redirect URL with invitation context
    // Both sign-in and sign-up forms support this context (locked email field)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const authUrl = new URL(existingUser ? '/sign-in' : '/sign-up', baseUrl)
    authUrl.searchParams.set('invitationId', invitationId)
    authUrl.searchParams.set('email', invitation.email)
    authUrl.searchParams.set('org', invitation.organization.name)

    redirect(authUrl.pathname + authUrl.search)
  }

  // ============================================================================
  // STEP 4: Authenticated - validate email matches invitation
  // ============================================================================

  const userEmail = session.user.email.toLowerCase()
  const invitedEmail = invitation.email.toLowerCase()

  if (userEmail !== invitedEmail) {
    // Email mismatch - show error with sign-out option
    // This prevents users from accepting invitations meant for others
    return (
      <InvitationEmailMismatch
        currentEmail={session.user.email}
        invitedEmail={invitation.email}
        organizationName={invitation.organization.name}
        invitationId={invitationId}
      />
    )
  }

  // ============================================================================
  // STEP 5: Email matches - accept invitation
  // ============================================================================

  try {
    await auth.api.acceptInvitation({
      headers: await headers(),
      body: {
        invitationId,
      },
    })

    // ============================================================================
    // STEP 6: Set newly joined organization as active
    // ============================================================================
    // WHY: User just joined this org - they expect to see its data
    // HOW: Update session's activeOrganizationId directly in database
    //
    // SECURITY: This only runs AFTER successful invitation acceptance,
    // so user is guaranteed to be a member of this organization.
    if (session.session?.id) {
      await prisma.session.update({
        where: { id: session.session.id },
        data: { activeOrganizationId: invitation.organization.id },
      })
    }

    // ============================================================================
    // STEP 7: Initialize default availability for new member
    // ============================================================================
    // WHY: Members should have default working hours when they join, not when they visit settings
    // HOW: Find the newly created member record and create Mon-Fri 9am-5pm availability
    const newMember = await prisma.member.findFirst({
      where: {
        userId: session.user.id,
        organizationId: invitation.organization.id,
      },
      select: { id: true },
    })

    if (newMember) {
      await initializeMemberAvailability(newMember.id)
    }
  } catch (error) {
    // Log error for debugging
    console.error('[AcceptInvitation] Failed to accept:', error)
    // Redirect with error
    redirect('/sign-up?error=acceptance_failed')
  }

  // Redirect to dashboard after successful acceptance
  // User will now see the newly joined organization's data
  redirect('/')
}
